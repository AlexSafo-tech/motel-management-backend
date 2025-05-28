// routes/reservations.js - ROTAS CORRIGIDAS USANDO MODELO SEPARADO
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Reservation = require('../models/Reservation'); // ✅ IMPORTAR MODELO CORRETO
const Room = require('../models/Room'); // ✅ IMPORTAR MODELO DE QUARTO
const auth = require('../middleware/auth');

// ✅ ROTA GET - LISTAR RESERVAS
router.get('/', auth, async (req, res) => {
  try {
    console.log('📋 [GET] /api/reservations - Listando reservas...');
    
    // ✅ BUSCAR COM POPULATE DO QUARTO
    const reservations = await Reservation
      .find()
      .populate('roomId', 'number type floor')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    console.log(`📋 Encontradas ${reservations.length} reservas`);

    // ✅ FORMATAR PARA O FRONTEND
    const formattedReservations = reservations.map(reservation => ({
      _id: reservation._id,
      reservationNumber: reservation.reservationNumber,
      
      // Dados do cliente
      customer: {
        name: reservation.customerName,
        phone: reservation.customerPhone,
        email: reservation.customerEmail,
        document: reservation.customerDocument
      },
      
      // Dados do quarto
      room: {
        id: reservation.roomId?._id || reservation.roomId,
        number: reservation.roomId?.number || reservation.roomNumber,
        type: reservation.roomId?.type
      },
      
      // Datas e períodos
      checkIn: reservation.checkIn,
      checkOut: reservation.checkOut,
      periodType: reservation.periodType,
      periodName: reservation.periodName,
      
      // Valores
      pricing: {
        basePrice: reservation.basePrice,
        totalPrice: reservation.totalPrice
      },
      
      // Status e pagamento
      status: reservation.status,
      paymentMethod: reservation.paymentMethod,
      paymentStatus: reservation.paymentStatus,
      
      // Metadados
      notes: reservation.notes,
      createdAt: reservation.createdAt,
      updatedAt: reservation.updatedAt,
      createdBy: reservation.createdBy,
      
      // Compatibilidade com frontend antigo
      cliente: {
        nome: reservation.customerName,
        telefone: reservation.customerPhone
      },
      quarto: reservation.roomNumber,
      periodo: reservation.periodName,
      valor: reservation.totalPrice.toFixed(2),
      data: reservation.checkIn
    }));

    res.json({
      success: true,
      message: `${formattedReservations.length} reservas encontradas`,
      data: formattedReservations,
      total: formattedReservations.length
    });
    
  } catch (error) {
    console.error('❌ Erro ao listar reservas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao listar reservas',
      error: error.message
    });
  }
});

// ✅ ROTA POST - CRIAR RESERVA
router.post('/', auth, async (req, res) => {
  try {
    console.log('🆕 [POST] /api/reservations - Criando nova reserva...');
    console.log('📦 Dados recebidos:', JSON.stringify(req.body, null, 2));

    const {
      checkIn,
      checkOut,
      periodType = '4h',
      roomId,
      _originalData = {}
    } = req.body;

    // ✅ VALIDAÇÕES
    if (!checkIn || !checkOut) {
      return res.status(400).json({
        success: false,
        message: 'Datas de check-in e check-out são obrigatórias'
      });
    }

    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: 'ID do quarto é obrigatório'
      });
    }

    // ✅ BUSCAR QUARTO
    let room;
    try {
      room = await Room.findById(roomId);
      if (!room) {
        throw new Error('Quarto não encontrado');
      }
    } catch (error) {
      console.log('⚠️ Quarto não encontrado, usando dados do request');
      room = {
        _id: roomId,
        number: _originalData.quartoNumero || '101',
        type: 'standard'
      };
    }

    // ✅ VERIFICAR DISPONIBILIDADE DO QUARTO
    if (room.status && room.status === 'occupied') {
      return res.status(400).json({
        success: false,
        message: 'Quarto já está ocupado'
      });
    }

    // ✅ PROCESSAR DADOS DO CLIENTE
    const originalData = _originalData || {};
    
    // ✅ MAPEAR PERÍODO
    const periodMap = {
      '3h': { name: '3 HORAS', hours: 3 },
      '4h': { name: '4 HORAS', hours: 4 },
      '6h': { name: '6 HORAS', hours: 6 },
      '12h': { name: '12 HORAS', hours: 12 },
      'daily': { name: 'DIÁRIA', hours: 24 },
      'pernoite': { name: 'PERNOITE', hours: 12 }
    };

    const period = periodMap[periodType] || periodMap['4h'];

    // ✅ CALCULAR PREÇO
    let basePrice = 50.00;
    if (room.prices && room.prices[periodType]) {
      basePrice = room.prices[periodType];
    } else if (originalData.valor) {
      basePrice = parseFloat(originalData.valor);
    }

    // ✅ MAPEAR PAGAMENTO
    const paymentMethodMap = {
      'Dinheiro': 'cash',
      'Cartão': 'card',
      'Pix': 'pix',
      'Transferência': 'transfer'
    };

    const paymentMethod = paymentMethodMap[originalData.pagamento] || 
                         originalData.pagamento?.toLowerCase() || 
                         'cash';

    // ✅ CRIAR DADOS DA RESERVA
    const reservationData = {
      // Cliente
      customerName: originalData.nome || 'Cliente não informado',
      customerPhone: originalData.telefone || '',
      customerEmail: originalData.email || '',
      customerDocument: originalData.documento || '',
      
      // Quarto
      roomId: room._id,
      roomNumber: room.number,
      
      // Datas
      checkIn: new Date(checkIn),
      checkOut: new Date(checkOut),
      
      // Período
      periodType: periodType,
      periodName: period.name,
      
      // Valores
      basePrice: basePrice,
      totalPrice: basePrice,
      
      // Status
      status: 'confirmed',
      paymentMethod: paymentMethod,
      paymentStatus: 'paid',
      
      // Metadados
      notes: `Check-in: ${originalData.checkInTime || 'N/A'} | Check-out: ${originalData.checkOutTime || 'N/A'}`,
      createdBy: req.user._id
    };

    console.log('💾 Criando reserva:', reservationData);

    // ✅ SALVAR RESERVA
    const reservation = new Reservation(reservationData);
    const savedReservation = await reservation.save();

    // ✅ ATUALIZAR STATUS DO QUARTO (se for um quarto real)
    if (room._id && mongoose.Types.ObjectId.isValid(room._id)) {
      await Room.findByIdAndUpdate(room._id, { 
        status: 'occupied',
        updatedAt: new Date()
      });
    }

    console.log('✅ Reserva criada:', savedReservation.reservationNumber);

    // ✅ RESPOSTA
    res.status(201).json({
      success: true,
      message: 'Reserva criada com sucesso',
      data: {
        reservation: {
          _id: savedReservation._id,
          reservationNumber: savedReservation.reservationNumber,
          customerName: savedReservation.customerName,
          customerPhone: savedReservation.customerPhone,
          roomNumber: savedReservation.roomNumber,
          checkIn: savedReservation.checkIn,
          checkOut: savedReservation.checkOut,
          periodName: savedReservation.periodName,
          totalPrice: savedReservation.totalPrice,
          status: savedReservation.status,
          paymentMethod: savedReservation.paymentMethod,
          createdAt: savedReservation.createdAt
        }
      }
    });

  } catch (error) {
    console.error('❌ Erro ao criar reserva:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Número de reserva duplicado'
      });
    }

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erro ao criar reserva',
      error: error.message
    });
  }
});

// ✅ ROTA GET - BUSCAR POR ID
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID inválido'
      });
    }

    const reservation = await Reservation
      .findById(id)
      .populate('roomId', 'number type floor')
      .populate('createdBy', 'name email')
      .lean();

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reserva não encontrada'
      });
    }

    res.json({
      success: true,
      message: 'Reserva encontrada',
      data: { reservation }
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar reserva:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar reserva',
      error: error.message
    });
  }
});

// ✅ ROTA PATCH - ATUALIZAR STATUS
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    console.log(`🔄 PATCH /api/reservations/${id}/status -> ${status}`);
    
    // ✅ VALIDAR STATUS
    const allowedStatuses = ['pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status inválido. Use: ' + allowedStatuses.join(', ')
      });
    }
    
    // ✅ BUSCAR E ATUALIZAR RESERVA
    const reservation = await Reservation.findByIdAndUpdate(
      id,
      { 
        status, 
        updatedAt: new Date(),
        updatedBy: req.user._id
      },
      { new: true }
    ).populate('roomId');

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reserva não encontrada'
      });
    }

    // ✅ ATUALIZAR STATUS DO QUARTO
    if (reservation.roomId) {
      let roomStatus = 'available';
      
      if (status === 'checked-in') {
        roomStatus = 'occupied';
      } else if (status === 'checked-out') {
        roomStatus = 'cleaning';
      } else if (status === 'cancelled') {
        roomStatus = 'available';
      }
      
      await Room.findByIdAndUpdate(reservation.roomId, { 
        status: roomStatus,
        updatedAt: new Date()
      });
      
      console.log(`🏨 Quarto ${reservation.roomNumber} -> ${roomStatus}`);
    }

    console.log(`✅ Reserva ${reservation.reservationNumber} -> ${status}`);

    res.json({
      success: true,
      message: `Status atualizado para ${status}`,
      data: { reservation }
    });
    
  } catch (error) {
    console.error('❌ Erro ao atualizar status:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar status',
      error: error.message
    });
  }
});

// ✅ ROTA DELETE - DELETAR RESERVA
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`🗑️ DELETE /api/reservations/${id}`);
    
    const reservation = await Reservation.findById(id);
    
    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reserva não encontrada'
      });
    }
    
    // ✅ LIBERAR QUARTO SE NECESSÁRIO
    if (reservation.roomId && reservation.status === 'checked-in') {
      await Room.findByIdAndUpdate(reservation.roomId, { 
        status: 'available',
        updatedAt: new Date()
      });
    }
    
    // ✅ DELETAR RESERVA
    await reservation.remove();
    
    console.log(`✅ Reserva ${reservation.reservationNumber} deletada`);

    res.json({
      success: true,
      message: 'Reserva deletada com sucesso',
      data: { deletedReservation: reservation }
    });
    
  } catch (error) {
    console.error('❌ Erro ao deletar reserva:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao deletar reserva',
      error: error.message
    });
  }
});

// ✅ ROTA GET - ESTATÍSTICAS
router.get('/stats/overview', auth, async (req, res) => {
  try {
    console.log('📊 GET /api/reservations/stats/overview');
    
    const todayStats = await Reservation.getTodayStats();
    const activeCount = await Reservation.countDocuments({ status: 'checked-in' });
    const totalCount = await Reservation.countDocuments();
    
    res.json({
      success: true,
      message: 'Estatísticas das reservas',
      data: {
        overview: {
          total: totalCount,
          today: todayStats.total,
          active: activeCount,
          todayRevenue: todayStats.revenue,
          todayStats: todayStats
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar estatísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar estatísticas',
      error: error.message
    });
  }
});

// ✅ ROTA GET - RESERVAS POR QUARTO
router.get('/room/:roomId', auth, async (req, res) => {
  try {
    const { roomId } = req.params;
    
    console.log(`🏨 GET /api/reservations/room/${roomId}`);
    
    const reservations = await Reservation
      .findByRoom(roomId)
      .populate('createdBy', 'name email')
      .sort({ checkIn: -1 });
    
    res.json({
      success: true,
      message: `${reservations.length} reservas encontradas para o quarto`,
      data: reservations
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar reservas do quarto:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar reservas do quarto',
      error: error.message
    });
  }
});

module.exports = router;
