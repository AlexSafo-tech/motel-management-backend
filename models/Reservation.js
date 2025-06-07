// routes/reservations.js - VERSÃO COMPLETA CORRIGIDA

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Reservation = require('../models/Reservation');
const Room = require('../models/Room');
const { authenticate } = require('../middleware/auth');

console.log('✅ Modelo Reservation importado com sucesso');

// ✅ FUNÇÃO PARA BUSCAR QUARTO DISPONÍVEL
const buscarQuartoDisponivel = async () => {
  try {
    const availableRoom = await Room.findOne({ 
      status: { $in: ['available', 'cleaning'] } 
    }).sort({ number: 1 });
    
    if (availableRoom) {
      console.log(`🏨 Quarto real encontrado: ${availableRoom.number}`);
      return {
        id: availableRoom._id.toString(),
        number: availableRoom.number || '101',
        type: availableRoom.type || 'standard'
      };
    }
  } catch (error) {
    console.log('⚠️ Quartos não encontrados:', error.message);
  }
  
  // Fallback - quarto padrão
  console.log('🏨 Usando quarto padrão: 101');
  return {
    id: 'room-default',
    number: '101',
    type: 'standard'
  };
};

// ✅ VERIFICAR SE QUARTO DEVE SER BLOQUEADO
const shouldBlockRoom = (checkInDate, checkOutDate) => {
  const now = new Date();
  const checkIn = new Date(checkInDate);
  
  // Regras de bloqueio:
  // 1. Check-in é hoje
  const isCheckInToday = checkIn.toDateString() === now.toDateString();
  
  // 2. Check-in já passou (reserva imediata)
  const isImmediate = checkIn <= now;
  
  // 3. Check-in é nas próximas 2 horas (pré-bloqueio)
  const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const isWithinTwoHours = checkIn <= twoHoursFromNow && checkIn > now;
  
  const shouldBlock = isCheckInToday || isImmediate || isWithinTwoHours;
  
  console.log(`🎯 Análise de bloqueio:`, {
    checkIn: checkIn.toLocaleString('pt-BR'),
    agora: now.toLocaleString('pt-BR'),
    isCheckInToday,
    isImmediate, 
    isWithinTwoHours,
    shouldBlock
  });
  
  return shouldBlock;
};

// ✅ FUNÇÃO PRINCIPAL DE GESTÃO DE QUARTO
const gerenciarStatusQuarto = async (roomId, operacao, dadosReserva = {}) => {
  try {
    if (!roomId || roomId === 'room-default') return;
    
    const { checkInDate, checkOutDate, status: reservationStatus } = dadosReserva;
    let novoStatus = 'available';
    
    switch (operacao) {
      case 'criar_reserva':
        if (shouldBlockRoom(checkInDate, checkOutDate)) {
          novoStatus = 'occupied';
          console.log(`🔒 Quarto ${roomId} bloqueado para reserva imediata/hoje`);
        } else {
          console.log(`📅 Quarto ${roomId} mantido disponível - reserva futura`);
          return; // Não alterar status
        }
        break;
        
      case 'check_in':
        novoStatus = 'occupied';
        break;
        
      case 'check_out':
        novoStatus = 'cleaning';
        break;
        
      case 'limpar':
        novoStatus = 'available';
        break;
        
      case 'cancelar':
        novoStatus = 'available';
        break;
        
      default:
        console.log(`⚠️ Operação desconhecida: ${operacao}`);
        return;
    }
    
    const result = await Room.findByIdAndUpdate(roomId, { 
      status: novoStatus,
      updatedAt: new Date()
    });
    
    if (result) {
      console.log(`✅ Quarto ${result.number} → ${novoStatus} (${operacao})`);
    }
    
  } catch (error) {
    console.log(`⚠️ Erro ao gerenciar quarto:`, error.message);
  }
};

// ✅ FUNÇÃO LEGACY PARA COMPATIBILIDADE
const atualizarStatusQuarto = async (roomId, status) => {
  try {
    if (roomId && roomId !== 'room-default') {
      const result = await Room.findByIdAndUpdate(roomId, { 
        status,
        updatedAt: new Date()
      });
      
      if (result) {
        console.log(`✅ Quarto ${result.number} → ${status}`);
      }
    }
  } catch (error) {
    console.log('⚠️ Não foi possível atualizar quarto');
  }
};

// ✅ ROTA 1: LISTAR RESERVAS
router.get('/', authenticate, async (req, res) => {
  try {
    console.log('📋 [GET] Listando reservas...');
    
    const reservations = await Reservation.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    console.log(`📋 Encontradas ${reservations.length} reservas`);

    const formattedReservations = reservations.map(reservation => ({
      _id: reservation._id || '',
      reservationNumber: reservation.reservationNumber || 'N/A',
      
      customer: {
        name: reservation.customerName || 'Cliente não informado',
        phone: reservation.customerPhone || '',
        email: reservation.customerEmail || ''
      },
      room: {
        id: reservation.roomId || 'room-default',
        number: reservation.roomNumber || '101'
      },
      checkIn: reservation.checkIn || new Date(),
      checkOut: reservation.checkOut || new Date(),
      periodType: reservation.periodType || '4h',
      pricing: {
        basePrice: reservation.basePrice || 50.00,
        totalPrice: reservation.totalPrice || 50.00
      },
      status: reservation.status || 'confirmed',
      paymentMethod: reservation.paymentMethod || 'cash',
      createdAt: reservation.createdAt || new Date(),
      
      // ✅ COMPATIBILIDADE COM FRONTEND ANTIGO
      cliente: {
        nome: reservation.customerName || 'Cliente não informado',
        telefone: reservation.customerPhone || ''
      },
      data: reservation.checkIn ? new Date(reservation.checkIn).toLocaleDateString('pt-BR') : 'N/A',
      periodo: reservation.periodName || '4 HORAS',
      valor: (reservation.totalPrice || 50.00).toFixed(2)
    }));

    res.json({
      success: true,
      data: formattedReservations,
      total: formattedReservations.length
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

// ✅ ROTA 2: CRIAR RESERVA - CORRIGIDA PARA CAPTURAR DADOS DO CLIENTE
router.post('/', authenticate, async (req, res) => {
  try {
    console.log('🆕 [POST] Criando nova reserva...');
    console.log('📦 Body completo:', JSON.stringify(req.body, null, 2));

    // ✅ EXTRAIR TODOS OS DADOS DO CLIENTE DIRETAMENTE DO BODY
    const {
      // Dados obrigatórios
      checkIn,
      checkOut,
      periodType = '4h',
      roomId,
      totalPrice,
      paymentMethod = 'Dinheiro',
      
      // 🚨 DADOS DO CLIENTE - CAPTURAR DIRETAMENTE
      customerName,
      customerPhone,
      customerEmail, 
      customerDocument,
      customerId
    } = req.body;

    console.log('🔍 === DADOS EXTRAÍDOS DO BODY ===');
    console.log('👤 customerName:', customerName);
    console.log('📞 customerPhone:', customerPhone);
    console.log('📧 customerEmail:', customerEmail);
    console.log('📄 customerDocument:', customerDocument);
    console.log('🆔 customerId:', customerId);

    // ✅ VALIDAÇÕES BÁSICAS
    if (!checkIn || !checkOut) {
      console.log('❌ Datas obrigatórias ausentes');
      return res.status(400).json({
        success: false,
        message: 'Datas de check-in e check-out são obrigatórias'
      });
    }

    // ✅ VALIDAR E CONVERTER DATAS
    let checkInDate, checkOutDate;
    try {
      checkInDate = new Date(checkIn);
      checkOutDate = new Date(checkOut);
      
      if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
        throw new Error('Datas inválidas');
      }
    } catch (dateError) {
      console.log('❌ Erro nas datas:', dateError.message);
      return res.status(400).json({
        success: false,
        message: 'Formato de data inválido'
      });
    }

    // ✅ BUSCAR QUARTO DISPONÍVEL
    let room;
    if (roomId) {
      try {
        room = await Room.findById(roomId);
        if (room) {
          room = {
            id: room._id.toString(),
            number: room.number,
            type: room.type
          };
        }
      } catch (error) {
        console.log('⚠️ Erro ao buscar quarto:', error.message);
      }
    }
    
    if (!room) {
      room = await buscarQuartoDisponivel();
    }

    // ✅ MAPEAR PERÍODO PARA NOME
    const periodNameMap = {
      '3h': '3 HORAS',
      '4h': '4 HORAS',
      '6h': '6 HORAS', 
      '12h': '12 HORAS',
      'daily': 'DIÁRIA',
      'pernoite': 'PERNOITE'
    };

    // ✅ MAPEAR PREÇOS BASE
    const priceMap = {
      '3h': 50.00,
      '4h': 55.00,
      '6h': 70.00,
      '12h': 90.00,
      'daily': 150.00,
      'pernoite': 120.00
    };

    // ✅ CALCULAR PREÇO FINAL
    let finalPrice = parseFloat(totalPrice) || priceMap[periodType] || 50.00;
    
    console.log('💰 Preço final calculado:', finalPrice);

    // ✅ MAPEAR PAGAMENTO
    const paymentMethodMap = {
      'Dinheiro': 'cash',
      'Cartão': 'card', 
      'Pix': 'pix',
      'Transferência': 'transfer'
    };

    const finalPaymentMethod = paymentMethodMap[paymentMethod] || 'cash';

    // ✅ PROCESSAR NOME DO CLIENTE - GARANTIR QUE NÃO SEJA VAZIO
    let finalCustomerName = 'Cliente não informado';
    
    if (customerName && typeof customerName === 'string' && customerName.trim() !== '') {
      finalCustomerName = customerName.trim();
      console.log('✅ Nome do cliente válido:', finalCustomerName);
    } else {
      console.log('⚠️ Nome do cliente não fornecido ou inválido, usando padrão');
    }

    // ✅ DADOS SEGUROS PARA SALVAR
    const reservationData = {
      // 🚨 DADOS DO CLIENTE - USAR OS VALORES CORRETOS
      customerName: finalCustomerName,
      customerPhone: (customerPhone && typeof customerPhone === 'string') ? customerPhone.trim() : '',
      customerEmail: (customerEmail && typeof customerEmail === 'string') ? customerEmail.trim() : '',
      customerDocument: (customerDocument && typeof customerDocument === 'string') ? customerDocument.trim() : '',
      
      roomId: room.id,
      roomNumber: room.number,
      
      checkIn: checkInDate,
      checkOut: checkOutDate,
      
      periodType: periodType,
      periodName: periodNameMap[periodType] || '4 HORAS',
      
      basePrice: finalPrice,
      totalPrice: finalPrice,
      
      status: 'confirmed',
      paymentMethod: finalPaymentMethod,
      paymentStatus: 'paid',
      
      notes: `Cliente: ${finalCustomerName} | Tel: ${customerPhone || 'N/A'} | Pagto: ${paymentMethod || 'N/A'}`,
      createdBy: req.user._id
    };

    console.log('💾 === DADOS FINAIS PARA SALVAR ===');
    console.log('👤 Nome:', reservationData.customerName);
    console.log('📞 Telefone:', reservationData.customerPhone);
    console.log('📧 Email:', reservationData.customerEmail);
    console.log('💰 Preço:', reservationData.totalPrice);

    // ✅ CRIAR E SALVAR RESERVA
    const reservation = new Reservation(reservationData);
    const savedReservation = await reservation.save();

    console.log('✅ Reserva salva com sucesso:', savedReservation.reservationNumber);
    console.log('👤 Nome salvo:', savedReservation.customerName);
    console.log('📞 Telefone salvo:', savedReservation.customerPhone);

    // ✅ GESTÃO INTELIGENTE DO QUARTO - SÓ BLOQUEIA SE NECESSÁRIO
    await gerenciarStatusQuarto(room.id, 'criar_reserva', {
      checkInDate: checkInDate,
      checkOutDate: checkOutDate,
      status: 'confirmed'
    });

    // ✅ RESPOSTA DE SUCESSO
    res.status(201).json({
      success: true,
      message: 'Reserva criada com sucesso',
      data: {
        reservation: {
          _id: savedReservation._id,
          reservationNumber: savedReservation.reservationNumber,
          customerName: savedReservation.customerName,
          customerPhone: savedReservation.customerPhone,
          customerEmail: savedReservation.customerEmail,
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
    
    // ✅ TRATAR ERROS ESPECÍFICOS
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Número de reserva já existe'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// ✅ ROTA 3: BUSCAR POR ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID inválido'
      });
    }

    const reservation = await Reservation.findById(id).lean();

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

// ✅ ROTA 4: ATUALIZAR STATUS
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const allowedStatuses = ['pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status inválido'
      });
    }
    
    const reservation = await Reservation.findByIdAndUpdate(
      id,
      { status, updatedAt: new Date() },
      { new: true }
    );

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reserva não encontrada'
      });
    }

    // ✅ GESTÃO INTELIGENTE DO QUARTO BASEADA NO STATUS
    switch (status) {
      case 'checked-in':
        await gerenciarStatusQuarto(reservation.roomId, 'check_in');
        break;
      case 'checked-out':
        await gerenciarStatusQuarto(reservation.roomId, 'check_out');
        break;
      case 'cancelled':
        await gerenciarStatusQuarto(reservation.roomId, 'cancelar');
        break;
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

// ✅ ROTA 5: DELETAR
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const reservation = await Reservation.findByIdAndDelete(id);

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reserva não encontrada'
      });
    }

    // ✅ LIBERAR QUARTO
    await gerenciarStatusQuarto(reservation.roomId, 'cancelar');

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

// ✅ ROTA 6: ESTATÍSTICAS
router.get('/stats/overview', authenticate, async (req, res) => {
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

// ✅ HEALTH CHECK
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Rotas de reservas funcionando',
    timestamp: new Date().toISOString()
  });
});

console.log('✅ Rotas de reservas registradas com sucesso');

module.exports = router;
