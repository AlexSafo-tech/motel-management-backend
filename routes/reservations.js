// routes/reservations.js - Rotas de gerenciamento de reservas

const express = require('express');
const router = express.Router();
const Reservation = require('../models/Reservation');
const Room = require('../models/Room');
const Customer = require('../models/Customer');
const { authenticate, authorize, checkPermission } = require('../middleware/auth');
const { validateReservation, sanitizeInput } = require('../middleware/validation');

// @route   GET /api/reservations
// @desc    Listar todas as reservas
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status,
      roomId,
      customerId,
      dateFrom,
      dateTo,
      search,
      periodType
    } = req.query;
    
    // Construir filtros
    const filters = {};
    
    if (status) filters.status = status;
    if (roomId) filters.roomId = roomId;
    if (customerId) filters.customerId = customerId;
    if (periodType) filters.periodType = periodType;
    
    // Filtros de data
    if (dateFrom || dateTo) {
      filters.checkIn = {};
      if (dateFrom) filters.checkIn.$gte = new Date(dateFrom);
      if (dateTo) filters.checkIn.$lte = new Date(dateTo);
    }
    
    if (search) {
      filters.reservationNumber = { $regex: search, $options: 'i' };
    }

    // Executar consulta com paginação e populações
    const reservations = await Reservation.find(filters)
      .populate('roomId', 'number type status')
      .populate('customerId', 'name phone email')
      .populate('createdBy', 'name')
      .populate('checkedInBy', 'name')
      .populate('checkedOutBy', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Reservation.countDocuments(filters);

    // Adicionar informações calculadas
    const reservationsWithCalcs = reservations.map(reservation => ({
      ...reservation.toObject(),
      totalHours: reservation.totalHours,
      isActive: reservation.isActive,
      canCheckIn: reservation.canCheckIn,
      remainingTime: reservation.status === 'checked-in' ? reservation.getRemainingTime() : null
    }));

    res.json({
      success: true,
      data: {
        reservations: reservationsWithCalcs,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Erro ao listar reservas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/reservations/active
// @desc    Listar reservas ativas (checked-in)
// @access  Private
router.get('/active', authenticate, async (req, res) => {
  try {
    const activeReservations = await Reservation.find({
      status: 'checked-in'
    })
    .populate('roomId', 'number type')
    .populate('customerId', 'name phone')
    .sort({ checkIn: 1 });

    // Adicionar tempo restante para cada reserva
    const reservationsWithTime = activeReservations.map(reservation => ({
      ...reservation.toObject(),
      remainingTime: reservation.getRemainingTime(),
      totalHours: reservation.totalHours
    }));

    res.json({
      success: true,
      data: { reservations: reservationsWithTime }
    });
  } catch (error) {
    console.error('Erro ao listar reservas ativas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/reservations/:id
// @desc    Obter detalhes de uma reserva específica
// @access  Private
router.get('/:id', authenticate, async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id)
      .populate('roomId')
      .populate('customerId')
      .populate('createdBy', 'name email')
      .populate('checkedInBy', 'name email')
      .populate('checkedOutBy', 'name email')
      .populate('cancelledBy', 'name email');

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reserva não encontrada'
      });
    }

    // Buscar pedidos relacionados à reserva
    const Order = require('../models/Order');
    const orders = await Order.find({ reservationId: reservation._id })
      .populate('customerId', 'name')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        reservation: {
          ...reservation.toObject(),
          totalHours: reservation.totalHours,
          isActive: reservation.isActive,
          canCheckIn: reservation.canCheckIn,
          remainingTime: reservation.status === 'checked-in' ? reservation.getRemainingTime() : null
        },
        orders
      }
    });
  } catch (error) {
    console.error('Erro ao obter detalhes da reserva:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   POST /api/reservations
// @desc    Criar nova reserva
// @access  Private
router.post('/', authenticate, sanitizeInput, validateReservation, async (req, res) => {
  try {
    const { roomId, customerId, checkIn, checkOut, periodType } = req.body;

    // Verificar se quarto existe e está disponível
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Quarto não encontrado'
      });
    }

    if (!room.isAvailable) {
      return res.status(400).json({
        success: false,
        message: 'Quarto não está disponível'
      });
    }

    // Verificar se cliente existe
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado'
      });
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    // Verificar conflitos de reserva
    const conflictingReservations = await Reservation.find({
      roomId: roomId,
      status: { $in: ['confirmed', 'checked-in'] },
      $or: [
        {
          checkIn: { $lt: checkOutDate },
          checkOut: { $gt: checkInDate }
        }
      ]
    });

    if (conflictingReservations.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Já existe uma reserva para este quarto no período solicitado',
        conflictingReservations: conflictingReservations.map(r => ({
          id: r._id,
          checkIn: r.checkIn,
          checkOut: r.checkOut
        }))
      });
    }

    // Calcular duração e preço
    const duration = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60)); // em horas
    const basePrice = room.calculatePrice(periodType, duration);

    // Aplicar desconto de fidelidade se cliente for elegível
    let discountPercentage = customer.loyalty.discountPercentage || 0;
    const discountAmount = (basePrice * discountPercentage) / 100;

    // Criar reserva
    const reservation = new Reservation({
      ...req.body,
      duration: {
        hours: duration,
        minutes: 0
      },
      pricing: {
        basePrice,
        discountAmount,
        discountPercentage,
        totalPrice: basePrice - discountAmount
      },
      createdBy: req.user._id
    });

    await reservation.save();

    // Atualizar status do quarto para occupied se check-in for imediato
    if (checkInDate <= new Date()) {
      room.status = 'occupied';
      await room.save();
    }

    // Popular dados para retorno
    await reservation.populate('roomId', 'number type');
    await reservation.populate('customerId', 'name phone email loyalty');
    await reservation.populate('createdBy', 'name');

    res.status(201).json({
      success: true,
      message: 'Reserva criada com sucesso',
      data: {
        reservation: {
          ...reservation.toObject(),
          totalHours: reservation.totalHours,
          canCheckIn: reservation.canCheckIn
        }
      }
    });
  } catch (error) {
    console.error('Erro ao criar reserva:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   PATCH /api/reservations/:id/checkin
// @desc    Realizar check-in
// @access  Private
router.patch('/:id/checkin', authenticate, checkPermission('canManageReservations'), async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id)
      .populate('roomId')
      .populate('customerId');

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reserva não encontrada'
      });
    }

    if (!reservation.canCheckIn) {
      return res.status(400).json({
        success: false,
        message: 'Check-in não permitido. Verifique o status da reserva e o horário.'
      });
    }

    // Verificar se quarto está disponível
    if (reservation.roomId.status !== 'available' && reservation.roomId.status !== 'cleaning') {
      return res.status(400).json({
        success: false,
        message: 'Quarto não está disponível para check-in'
      });
    }

    // Realizar check-in
    await reservation.doCheckIn(req.user._id);

    // Atualizar status do quarto
    reservation.roomId.status = 'occupied';
    await reservation.roomId.save();

    // Atualizar estatísticas do cliente
    const customer = reservation.customerId;
    await customer.updateStats({
      amountSpent: reservation.pricing.totalPrice,
      roomNumber: reservation.roomId.number
    });

    await reservation.populate('checkedInBy', 'name');

    res.json({
      success: true,
      message: 'Check-in realizado com sucesso',
      data: {
        reservation: {
          ...reservation.toObject(),
          remainingTime: reservation.getRemainingTime()
        }
      }
    });
  } catch (error) {
    console.error('Erro ao realizar check-in:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   PATCH /api/reservations/:id/checkout
// @desc    Realizar check-out
// @access  Private
router.patch('/:id/checkout', authenticate, checkPermission('canManageReservations'), async (req, res) => {
  try {
    const { extraCharges = 0, notes } = req.body;

    const reservation = await Reservation.findById(req.params.id)
      .populate('roomId')
      .populate('customerId');

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reserva não encontrada'
      });
    }

    if (reservation.status !== 'checked-in') {
      return res.status(400).json({
        success: false,
        message: 'Só é possível fazer check-out de reservas com status "checked-in"'
      });
    }

    // Calcular consumo total dos pedidos
    const Order = require('../models/Order');
    const orders = await Order.find({ 
      reservationId: reservation._id,
      status: 'delivered'
    });

    const consumptionTotal = orders.reduce((total, order) => total + order.pricing.total, 0);

    // Realizar check-out
    await reservation.doCheckOut(req.user._id, extraCharges);

    // Atualizar consumo total
    reservation.consumptionTotal = consumptionTotal;
    if (notes) reservation.notes = notes;
    await reservation.save();

    // Atualizar status do quarto para limpeza
    reservation.roomId.status = 'cleaning';
    await reservation.roomId.save();

    // Calcular duração real da estadia
    const actualStayDuration = Math.ceil((reservation.actualCheckOut - reservation.actualCheckIn) / (1000 * 60 * 60));

    // Atualizar estatísticas do cliente
    await reservation.customerId.updateStats({
      stayDuration: actualStayDuration,
      amountSpent: consumptionTotal + extraCharges
    });

    await reservation.populate('checkedOutBy', 'name');

    res.json({
      success: true,
      message: 'Check-out realizado com sucesso',
      data: {
        reservation: reservation.toObject(),
        summary: {
          stayDuration: actualStayDuration,
          consumptionTotal,
          extraCharges,
          finalTotal: reservation.pricing.totalPrice + consumptionTotal + extraCharges
        }
      }
    });
  } catch (error) {
    console.error('Erro ao realizar check-out:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   PATCH /api/reservations/:id/cancel
// @desc    Cancelar reserva
// @access  Private
router.patch('/:id/cancel', authenticate, checkPermission('canManageReservations'), async (req, res) => {
  try {
    const { reason = '' } = req.body;

    const reservation = await Reservation.findById(req.params.id)
      .populate('roomId');

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reserva não encontrada'
      });
    }

    if (reservation.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Reserva já está cancelada'
      });
    }

    if (reservation.status === 'checked-out') {
      return res.status(400).json({
        success: false,
        message: 'Não é possível cancelar uma reserva já finalizada'
      });
    }

    // Se estava checked-in, liberar o quarto
    if (reservation.status === 'checked-in') {
      reservation.roomId.status = 'cleaning';
      await reservation.roomId.save();
    }

    // Cancelar reserva
    await reservation.cancel(req.user._id, reason);

    await reservation.populate('cancelledBy', 'name');

    res.json({
      success: true,
      message: 'Reserva cancelada com sucesso',
      data: { reservation }
    });
  } catch (error) {
    console.error('Erro ao cancelar reserva:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   PUT /api/reservations/:id
// @desc    Atualizar reserva
// @access  Private
router.put('/:id', authenticate, sanitizeInput, validateReservation, async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id)
      .populate('roomId');

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reserva não encontrada'
      });
    }

    // Só permitir alteração se estiver pending ou confirmed
    if (!['pending', 'confirmed'].includes(reservation.status)) {
      return res.status(400).json({
        success: false,
        message: 'Só é possível alterar reservas com status "pending" ou "confirmed"'
      });
    }

    // Se alterando datas, verificar conflitos
    if (req.body.checkIn || req.body.checkOut) {
      const newCheckIn = new Date(req.body.checkIn || reservation.checkIn);
      const newCheckOut = new Date(req.body.checkOut || reservation.checkOut);

      const conflictingReservations = await Reservation.find({
        _id: { $ne: reservation._id },
        roomId: reservation.roomId._id,
        status: { $in: ['confirmed', 'checked-in'] },
        $or: [
          {
            checkIn: { $lt: newCheckOut },
            checkOut: { $gt: newCheckIn }
          }
        ]
      });

      if (conflictingReservations.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Conflito com outras reservas no novo período'
        });
      }
    }

    // Atualizar campos
    const allowedFields = ['checkIn', 'checkOut', 'periodType', 'guests', 'vehicleInfo', 'specialRequests', 'notes'];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        reservation[field] = req.body[field];
      }
    });

    // Recalcular preços se necessário
    if (req.body.checkIn || req.body.checkOut || req.body.periodType) {
      const checkInDate = new Date(reservation.checkIn);
      const checkOutDate = new Date(reservation.checkOut);
      const duration = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60));
      
      const room = await Room.findById(reservation.roomId._id);
      const basePrice = room.calculatePrice(reservation.periodType, duration);
      
      reservation.duration.hours = duration;
      reservation.pricing.basePrice = basePrice;
      reservation.pricing.totalPrice = basePrice - reservation.pricing.discountAmount + reservation.pricing.extraCharges;
    }

    await reservation.save();

    await reservation.populate('customerId', 'name phone email');
    await reservation.populate('createdBy', 'name');

    res.json({
      success: true,
      message: 'Reserva atualizada com sucesso',
      data: { reservation }
    });
  } catch (error) {
    console.error('Erro ao atualizar reserva:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/reservations/stats/overview
// @desc    Obter estatísticas gerais das reservas
// @access  Private
router.get('/stats/overview', authenticate, async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    // Reservas de hoje
    const todayReservations = await Reservation.countDocuments({
      checkIn: { $gte: startOfDay, $lte: endOfDay }
    });

    // Reservas ativas
    const activeReservations = await Reservation.countDocuments({
      status: 'checked-in'
    });

    // Reservas por status
    const statusStats = await Reservation.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Reservas por período (últimos 7 dias)
    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);

    const weeklyReservations = await Reservation.aggregate([
      {
        $match: {
          createdAt: { $gte: last7Days }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Receita do mês
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthlyRevenue = await Reservation.aggregate([
      {
        $match: {
          status: 'checked-out',
          checkOut: { $gte: startOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$pricing.totalPrice' },
          consumption: { $sum: '$consumptionTotal' },
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          todayReservations,
          activeReservations,
          totalRooms: await Room.countDocuments({ isActive: true }),
          occupancyRate: activeReservations > 0 ? 
            ((activeReservations / await Room.countDocuments({ isActive: true })) * 100).toFixed(2) : 0
        },
        statusDistribution: statusStats,
        weeklyTrend: weeklyReservations,
        monthlyRevenue: monthlyRevenue[0] || { total: 0, consumption: 0, count: 0 }
      }
    });
  } catch (error) {
    console.error('Erro ao obter estatísticas das reservas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;