// routes/rooms.js - Rotas de gerenciamento de quartos

const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const Reservation = require('../models/Reservation');
const { authenticate, authorize, checkPermission } = require('../middleware/auth');
const { validateRoom, sanitizeInput } = require('../middleware/validation');

// @route   GET /api/rooms
// @desc    Listar todos os quartos
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      type, 
      category,
      floor,
      available,
      search 
    } = req.query;
    
    // Construir filtros
    const filters = { isActive: true };
    
    if (status) filters.status = status;
    if (type) filters.type = type;
    if (category) filters.category = category;
    if (floor) filters.floor = parseInt(floor);
    if (available === 'true') filters.status = 'available';
    
    if (search) {
      filters.$or = [
        { number: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Executar consulta com paginação
    const rooms = await Room.find(filters)
      .sort({ number: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Room.countDocuments(filters);

    // Adicionar informações de ocupação atual para cada quarto
    const roomsWithOccupancy = await Promise.all(rooms.map(async (room) => {
      const currentReservation = await Reservation.findOne({
        roomId: room._id,
        status: 'checked-in',
        checkOut: { $gt: new Date() }
      }).populate('customerId', 'name phone');

      return {
        ...room.toObject(),
        currentReservation: currentReservation || null,
        isCurrentlyOccupied: !!currentReservation
      };
    }));

    res.json({
      success: true,
      data: {
        rooms: roomsWithOccupancy,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Erro ao listar quartos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/rooms/available
// @desc    Buscar quartos disponíveis por período
// @access  Private
router.get('/available', authenticate, async (req, res) => {
  try {
    const { checkIn, checkOut, type, category, capacity } = req.query;

    if (!checkIn || !checkOut) {
      return res.status(400).json({
        success: false,
        message: 'Datas de check-in e check-out são obrigatórias'
      });
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    if (checkInDate >= checkOutDate) {
      return res.status(400).json({
        success: false,
        message: 'Data de check-out deve ser posterior ao check-in'
      });
    }

    // Construir filtros básicos
    const filters = { 
      isActive: true,
      status: { $in: ['available', 'cleaning'] }
    };

    if (type) filters.type = type;
    if (category) filters.category = category;
    if (capacity) filters.capacity = { $gte: parseInt(capacity) };

    // Buscar quartos que atendem aos critérios básicos
    const potentialRooms = await Room.find(filters);

    // Verificar conflitos de reserva
    const availableRooms = [];

    for (const room of potentialRooms) {
      const conflictingReservations = await Reservation.find({
        roomId: room._id,
        status: { $in: ['confirmed', 'checked-in'] },
        $or: [
          {
            checkIn: { $lt: checkOutDate },
            checkOut: { $gt: checkInDate }
          }
        ]
      });

      if (conflictingReservations.length === 0) {
        // Calcular preços para diferentes períodos
        const duration = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60)); // em horas
        
        const pricing = {
          hourly: room.pricing.hourly * duration,
          period4h: Math.ceil(duration / 4) * room.pricing.period4h,
          period12h: Math.ceil(duration / 12) * room.pricing.period12h,
          daily: Math.ceil(duration / 24) * room.pricing.daily
        };

        availableRooms.push({
          ...room.toObject(),
          calculatedPricing: pricing,
          recommendedPeriod: duration <= 4 ? '4h' : duration <= 12 ? '12h' : 'daily'
        });
      }
    }

    res.json({
      success: true,
      data: {
        rooms: availableRooms,
        searchCriteria: {
          checkIn: checkInDate,
          checkOut: checkOutDate,
          duration: Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60)),
          type,
          category,
          capacity
        }
      }
    });
  } catch (error) {
    console.error('Erro ao buscar quartos disponíveis:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/rooms/:id
// @desc    Obter detalhes de um quarto específico
// @access  Private
router.get('/:id', authenticate, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Quarto não encontrado'
      });
    }

    // Buscar reserva atual se houver
    const currentReservation = await Reservation.findOne({
      roomId: room._id,
      status: 'checked-in'
    }).populate('customerId', 'name phone email');

    // Buscar próximas reservas
    const upcomingReservations = await Reservation.find({
      roomId: room._id,
      status: 'confirmed',
      checkIn: { $gte: new Date() }
    })
    .populate('customerId', 'name phone')
    .sort({ checkIn: 1 })
    .limit(5);

    // Buscar histórico de limpeza e manutenção
    const maintenanceHistory = await Reservation.find({
      roomId: room._id,
      status: 'checked-out'
    })
    .sort({ checkOut: -1 })
    .limit(10);

    res.json({
      success: true,
      data: {
        room: {
          ...room.toObject(),
          currentReservation,
          upcomingReservations,
          maintenanceHistory,
          isCurrentlyOccupied: !!currentReservation
        }
      }
    });
  } catch (error) {
    console.error('Erro ao obter detalhes do quarto:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   POST /api/rooms
// @desc    Criar novo quarto
// @access  Private (Admin/Manager)
router.post('/', authenticate, authorize('admin', 'manager'), sanitizeInput, validateRoom, async (req, res) => {
  try {
    // Verificar se número do quarto já existe
    const existingRoom = await Room.findOne({ number: req.body.number });
    if (existingRoom) {
      return res.status(400).json({
        success: false,
        message: 'Já existe um quarto com este número'
      });
    }

    const room = new Room(req.body);
    await room.save();

    res.status(201).json({
      success: true,
      message: 'Quarto criado com sucesso',
      data: { room }
    });
  } catch (error) {
    console.error('Erro ao criar quarto:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   PUT /api/rooms/:id
// @desc    Atualizar quarto
// @access  Private (Admin/Manager)
router.put('/:id', authenticate, authorize('admin', 'manager'), sanitizeInput, validateRoom, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Quarto não encontrado'
      });
    }

    // Verificar se novo número não conflita com outro quarto
    if (req.body.number && req.body.number !== room.number) {
      const existingRoom = await Room.findOne({ 
        number: req.body.number,
        _id: { $ne: room._id }
      });
      
      if (existingRoom) {
        return res.status(400).json({
          success: false,
          message: 'Já existe um quarto com este número'
        });
      }
    }

    // Atualizar campos
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        room[key] = req.body[key];
      }
    });

    await room.save();

    res.json({
      success: true,
      message: 'Quarto atualizado com sucesso',
      data: { room }
    });
  } catch (error) {
    console.error('Erro ao atualizar quarto:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   PATCH /api/rooms/:id/status
// @desc    Atualizar status do quarto
// @access  Private
router.patch('/:id/status', authenticate, checkPermission('canManageRooms'), async (req, res) => {
  try {
    const { status, notes } = req.body;
    const validStatuses = ['available', 'occupied', 'cleaning', 'maintenance', 'out_of_order'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status deve ser um dos seguintes: ${validStatuses.join(', ')}`
      });
    }

    const room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Quarto não encontrado'
      });
    }

    // Verificar se pode alterar o status (não pode marcar como disponível se há reserva ativa)
    if (status === 'available') {
      const activeReservation = await Reservation.findOne({
        roomId: room._id,
        status: 'checked-in'
      });

      if (activeReservation) {
        return res.status(400).json({
          success: false,
          message: 'Não é possível marcar como disponível. Há uma reserva ativa neste quarto.'
        });
      }
    }

    const oldStatus = room.status;
    room.status = status;
    
    if (notes) {
      room.notes = notes;
    }

    await room.save();

    res.json({
      success: true,
      message: `Status do quarto alterado de '${oldStatus}' para '${status}'`,
      data: {
        room,
        statusChange: {
          from: oldStatus,
          to: status,
          changedBy: req.user._id,
          timestamp: new Date()
        }
      }
    });
  } catch (error) {
    console.error('Erro ao alterar status do quarto:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   DELETE /api/rooms/:id
// @desc    Desativar quarto
// @access  Private (Admin only)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Quarto não encontrado'
      });
    }

    // Verificar se há reservas futuras
    const futureReservations = await Reservation.find({
      roomId: room._id,
      status: { $in: ['confirmed', 'checked-in'] },
      checkOut: { $gt: new Date() }
    });

    if (futureReservations.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Não é possível desativar. Há reservas futuras para este quarto.',
        futureReservations: futureReservations.length
      });
    }

    room.isActive = false;
    room.status = 'out_of_order';
    await room.save();

    res.json({
      success: true,
      message: 'Quarto desativado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao desativar quarto:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/rooms/stats/overview
// @desc    Obter estatísticas gerais dos quartos
// @access  Private
router.get('/stats/overview', authenticate, async (req, res) => {
  try {
    // Contar quartos por status
    const statusStats = await Room.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Contar quartos por tipo
    const typeStats = await Room.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    // Calcular taxa de ocupação atual
    const totalRooms = await Room.countDocuments({ isActive: true });
    const occupiedRooms = await Room.countDocuments({ isActive: true, status: 'occupied' });
    const occupancyRate = totalRooms > 0 ? ((occupiedRooms / totalRooms) * 100).toFixed(2) : 0;

    // Quartos que precisam de limpeza
    const roomsNeedingCleaning = await Room.countDocuments({ 
      isActive: true, 
      status: 'cleaning' 
    });

    // Quartos em manutenção
    const roomsInMaintenance = await Room.countDocuments({ 
      isActive: true, 
      status: { $in: ['maintenance', 'out_of_order'] }
    });

    res.json({
      success: true,
      data: {
        overview: {
          total: totalRooms,
          occupied: occupiedRooms,
          available: totalRooms - occupiedRooms,
          occupancyRate: parseFloat(occupancyRate),
          needingCleaning: roomsNeedingCleaning,
          inMaintenance: roomsInMaintenance
        },
        statusDistribution: statusStats,
        typeDistribution: typeStats
      }
    });
  } catch (error) {
    console.error('Erro ao obter estatísticas dos quartos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;