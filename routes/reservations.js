// routes/reservations.js - VERSÃO ULTRA SIMPLIFICADA (SEM DEPENDÊNCIAS)

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// ✅ MODELO INLINE ULTRA SIMPLES (sem validações complexas)
const reservationSchema = new mongoose.Schema({
  reservationNumber: {
    type: String,
    unique: true
  },
  // ✅ DADOS DO CLIENTE (inline, todos opcionais)
  customerName: { type: String, default: 'Cliente não informado' },
  customerPhone: { type: String, default: '' },
  customerEmail: { type: String, default: '' },
  customerDocument: { type: String, default: '' },
  
  // ✅ DADOS DO QUARTO (simples)
  roomId: { type: String, default: 'room-default' },
  roomNumber: { type: String, default: '101' },
  
  // ✅ DATAS (básicas)
  checkIn: { type: Date, required: true },
  checkOut: { type: Date, required: true },
  
  // ✅ PERÍODO E PREÇO (simples)
  periodType: { type: String, default: '4h' },
  periodName: { type: String, default: '4 HORAS' },
  basePrice: { type: Number, default: 50.00 },
  totalPrice: { type: Number, default: 50.00 },
  
  // ✅ STATUS E PAGAMENTO
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled'],
    default: 'confirmed'
  },
  paymentMethod: { type: String, default: 'cash' },
  paymentStatus: { type: String, default: 'paid' },
  
  // ✅ METADATA MÍNIMA
  notes: String,
  createdBy: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// ✅ AUTO-GERAR NÚMERO DE RESERVA
reservationSchema.pre('save', async function(next) {
  if (this.isNew && !this.reservationNumber) {
    const count = await this.constructor.countDocuments();
    this.reservationNumber = `RES${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

const Reservation = mongoose.model('Reservation', reservationSchema);

// ✅ MIDDLEWARE ULTRA PERMISSIVO
const simpleAuth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token || token === 'undefined' || token === 'null') {
    return res.status(401).json({
      success: false,
      message: 'Token necessário'
    });
  }

  // ✅ ACEITAR QUALQUER TOKEN VÁLIDO
  req.user = { _id: 'user123', name: 'Usuário', role: 'admin' };
  next();
};

// ✅ ROTA 1: LISTAR RESERVAS (SIMPLES)
router.get('/', simpleAuth, async (req, res) => {
  try {
    console.log('📋 Listando reservas...');
    
    const reservations = await Reservation.find()
      .sort({ createdAt: -1 })
      .limit(100);

    console.log(`📋 Encontradas ${reservations.length} reservas`);

    // ✅ FORMATO COMPATÍVEL COM FRONTEND
    const formattedReservations = reservations.map(reservation => ({
      _id: reservation._id,
      reservationNumber: reservation.reservationNumber,
      
      // ✅ FORMATO PARA FRONTEND ATUAL
      customer: {
        name: reservation.customerName,
        phone: reservation.customerPhone,
        email: reservation.customerEmail
      },
      room: {
        id: reservation.roomId,
        number: reservation.roomNumber
      },
      checkIn: reservation.checkIn,
      checkOut: reservation.checkOut,
      periodType: reservation.periodType,
      pricing: {
        basePrice: reservation.basePrice,
        totalPrice: reservation.totalPrice
      },
      status: reservation.status,
      paymentMethod: reservation.paymentMethod,
      createdAt: reservation.createdAt,
      
      // ✅ COMPATIBILIDADE COM FRONTEND ANTIGO
      cliente: {
        nome: reservation.customerName,
        telefone: reservation.customerPhone
      },
      data: reservation.checkIn.toLocaleDateString('pt-BR'),
      periodo: reservation.periodName,
      valor: reservation.totalPrice.toFixed(2)
    }));

    res.json({
      success: true,
      data: formattedReservations
    });
    
  } catch (error) {
    console.error('❌ Erro ao listar reservas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// ✅ ROTA 2: CRIAR RESERVA (ULTRA FLEXÍVEL)
router.post('/', simpleAuth, async (req, res) => {
  try {
    console.log('🆕 Criando nova reserva...');
    console.log('📦 Dados recebidos:', JSON.stringify(req.body, null, 2));

    const {
      checkIn,
      checkOut,
      periodType = '4h',
      roomId = 'room-default',
      _originalData = {}
    } = req.body;

    // ✅ VALIDAÇÕES MÍNIMAS
    if (!checkIn || !checkOut) {
      return res.status(400).json({
        success: false,
        message: 'Datas de check-in e check-out são obrigatórias'
      });
    }

    // ✅ MAPEAR DADOS DO FRONTEND ORIGINAL
    const originalData = _originalData || {};
    
    // ✅ BUSCAR QUARTO REAL SE EXISTIR
    let roomNumber = '101'; // padrão
    let realRoomId = roomId;
    
    try {
      // Tentar buscar um quarto real do AdminQuartos
      const Room = mongoose.model('Room');
      const availableRoom = await Room.findOne({ 
        status: { $in: ['available', 'cleaning'] } 
      }).sort({ number: 1 });
      
      if (availableRoom) {
        realRoomId = availableRoom._id.toString();
        roomNumber = availableRoom.number;
        console.log(`🏨 Usando quarto real: ${roomNumber} (${realRoomId})`);
      }
    } catch (roomError) {
      console.log('⚠️ Quartos do AdminQuartos não encontrados, usando padrão');
    }

    // ✅ MAPEAR PERÍODO PARA NOME LEGÍVEL
    const periodNameMap = {
      '4h': '4 HORAS',
      '6h': '6 HORAS',
      '12h': '12 HORAS',
      'daily': 'DIÁRIA',
      'pernoite': 'PERNOITE'
    };

    // ✅ MAPEAR PREÇOS
    const priceMap = {
      '4h': 50.00,
      '6h': 70.00,
      '12h': 100.00,
      'daily': 150.00,
      'pernoite': 120.00
    };

    const basePrice = originalData.valor || priceMap[periodType] || 50.00;

    // ✅ CRIAR RESERVA SIMPLES
    const reservation = new Reservation({
      customerName: originalData.nome || 'Cliente não informado',
      customerPhone: originalData.telefone || '',
      customerEmail: originalData.email || '',
      customerDocument: originalData.documento || '',
      
      roomId: realRoomId,
      roomNumber: roomNumber,
      
      checkIn: new Date(checkIn),
      checkOut: new Date(checkOut),
      
      periodType: periodType,
      periodName: periodNameMap[periodType] || originalData.periodo || '4 HORAS',
      
      basePrice: typeof basePrice === 'number' ? basePrice : parseFloat(basePrice) || 50.00,
      totalPrice: typeof basePrice === 'number' ? basePrice : parseFloat(basePrice) || 50.00,
      
      status: 'confirmed',
      paymentMethod: originalData.pagamento === 'Dinheiro' ? 'cash' :
                    originalData.pagamento === 'Cartão' ? 'card' :
                    originalData.pagamento === 'Pix' ? 'pix' :
                    originalData.pagamento === 'Transferência' ? 'transfer' : 'cash',
      paymentStatus: 'paid',
      
      notes: `Cliente: ${originalData.nome || 'N/A'} | Tel: ${originalData.telefone || 'N/A'} | Pagamento: ${originalData.pagamento || 'N/A'}`,
      createdBy: req.user._id
    });

    await reservation.save();

    console.log('✅ Reserva criada:', reservation.reservationNumber);

    // ✅ ATUALIZAR STATUS DO QUARTO SE EXISTIR
    try {
      const Room = mongoose.model('Room');
      await Room.findByIdAndUpdate(realRoomId, { 
        status: 'occupied',
        updatedAt: new Date()
      });
      console.log(`✅ Status do quarto ${roomNumber} alterado para ocupado`);
    } catch (roomUpdateError) {
      console.log('⚠️ Não foi possível atualizar status do quarto');
    }

    res.status(201).json({
      success: true,
      message: 'Reserva criada com sucesso',
      data: {
        reservation: {
          _id: reservation._id,
          reservationNumber: reservation.reservationNumber,
          customerName: reservation.customerName,
          customerPhone: reservation.customerPhone,
          roomNumber: reservation.roomNumber,
          checkIn: reservation.checkIn,
          checkOut: reservation.checkOut,
          periodName: reservation.periodName,
          totalPrice: reservation.totalPrice,
          status: reservation.status,
          paymentMethod: reservation.paymentMethod,
          createdAt: reservation.createdAt
        }
      }
    });

  } catch (error) {
    console.error('❌ Erro ao criar reserva:', error);
    
    // ✅ ERRO MAIS ESPECÍFICO
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Já existe uma reserva com este número'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message,
      details: error.stack
    });
  }
});

// ✅ ROTA 3: BUSCAR POR ID (SIMPLES)
router.get('/:id', simpleAuth, async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id);

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reserva não encontrada'
      });
    }

    res.json({
      success: true,
      data: { reservation }
    });
  } catch (error) {
    console.error('❌ Erro ao buscar reserva:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ ROTA 4: ATUALIZAR STATUS (SIMPLES)
router.patch('/:id/status', simpleAuth, async (req, res) => {
  try {
    const { status } = req.body;
    
    const reservation = await Reservation.findByIdAndUpdate(
      req.params.id,
      { 
        status,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reserva não encontrada'
      });
    }

    // ✅ ATUALIZAR QUARTO SE NECESSÁRIO
    try {
      const Room = mongoose.model('Room');
      let roomStatus = 'available';
      
      if (status === 'checked-in') roomStatus = 'occupied';
      else if (status === 'checked-out') roomStatus = 'cleaning';
      
      await Room.findByIdAndUpdate(reservation.roomId, { 
        status: roomStatus,
        updatedAt: new Date()
      });
    } catch (roomError) {
      console.log('⚠️ Não foi possível atualizar quarto');
    }

    res.json({
      success: true,
      message: `Status atualizado para ${status}`,
      data: { reservation }
    });
  } catch (error) {
    console.error('❌ Erro ao atualizar status:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ ROTA 5: DELETAR (SIMPLES)
router.delete('/:id', simpleAuth, async (req, res) => {
  try {
    const reservation = await Reservation.findByIdAndDelete(req.params.id);

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reserva não encontrada'
      });
    }

    // ✅ LIBERAR QUARTO
    try {
      const Room = mongoose.model('Room');
      await Room.findByIdAndUpdate(reservation.roomId, { 
        status: 'available',
        updatedAt: new Date()
      });
    } catch (roomError) {
      console.log('⚠️ Não foi possível liberar quarto');
    }

    res.json({
      success: true,
      message: 'Reserva deletada com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro ao deletar reserva:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ ROTA 6: ESTATÍSTICAS (OPCIONAL)
router.get('/stats/overview', simpleAuth, async (req, res) => {
  try {
    const total = await Reservation.countDocuments();
    const active = await Reservation.countDocuments({ status: 'checked-in' });
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));
    
    const todayCount = await Reservation.countDocuments({
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });

    res.json({
      success: true,
      data: {
        overview: {
          total,
          today: todayCount,
          active,
          totalReservations: total,
          todayReservations: todayCount,
          activeReservations: active
        }
      }
    });
  } catch (error) {
    console.error('❌ Erro ao buscar estatísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;
