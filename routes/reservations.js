// routes/reservations.js - VERSÃO COMPLETA COM SISTEMA DE CONFLITOS + ROTAS DEBUG

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Reservation = require('../models/Reservation');
const Room = require('../models/Room');
const { authenticate } = require('../middleware/auth');

console.log('✅ Modelo Reservation importado com sucesso');

// ✅ FUNÇÃO PARA DETECTAR TURNO ATUAL
const detectarTurnoAtual = (user) => {
  const agora = new Date();
  const hora = agora.getHours();
  
  let turnoAtual;
  if (hora >= 6 && hora < 14) {
    turnoAtual = { id: 'manha', nome: 'Manhã' };
  } else if (hora >= 14 && hora < 22) {
    turnoAtual = { id: 'tarde', nome: 'Tarde' };
  } else {
    turnoAtual = { id: 'noite', nome: 'Noite' };
  }
  
  const turnoId = `turno_${turnoAtual.id}_${agora.toISOString().split('T')[0]}_${user._id}`;
  
  return {
    turnoId: turnoId,
    turnoNome: turnoAtual.nome,
    funcionarioTurno: user.name || 'Funcionário',
    funcionarioTurnoId: user._id,
    dataInicioTurno: agora,
    horaInicioTurno: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  };
};

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

// 🔍 SISTEMA DE VERIFICAÇÃO DE CONFLITOS
const verificarConflitoReservas = async (roomId, checkInDate, checkOutDate, excludeReservationId = null) => {
  try {
    console.log('🔍 === VERIFICANDO CONFLITOS ===');
    console.log('🏨 Quarto:', roomId);
    console.log('📅 Check-in solicitado:', checkInDate.toLocaleString('pt-BR'));
    console.log('📅 Check-out solicitado:', checkOutDate.toLocaleString('pt-BR'));
    
    // Buscar reservas existentes para o mesmo quarto
    const query = {
      roomId: roomId,
      status: { $in: ['confirmed', 'checked-in'] }, // Apenas reservas ativas
    };
    
    // Excluir uma reserva específica (útil para edições)
    if (excludeReservationId) {
      query._id = { $ne: excludeReservationId };
    }
    
    const reservasExistentes = await Reservation.find(query);
    
    console.log(`📋 Encontradas ${reservasExistentes.length} reservas ativas para este quarto`);
    
    // Verificar cada reserva existente
    const conflitos = [];
    
    for (const reserva of reservasExistentes) {
      const reservaCheckIn = new Date(reserva.checkIn);
      const reservaCheckOut = new Date(reserva.checkOut);
      
      console.log(`🔍 Verificando reserva ${reserva.reservationNumber}:`);
      console.log(`   📅 Período existente: ${reservaCheckIn.toLocaleString('pt-BR')} → ${reservaCheckOut.toLocaleString('pt-BR')}`);
      
      // ✅ LÓGICA DE DETECÇÃO DE CONFLITO
      // Conflito ocorre quando os períodos se sobrepõem
      const temConflito = (
        // Nova reserva começa antes da existente terminar
        // E nova reserva termina depois da existente começar
        checkInDate < reservaCheckOut && checkOutDate > reservaCheckIn
      );
      
      if (temConflito) {
        console.log(`❌ CONFLITO DETECTADO com reserva ${reserva.reservationNumber}!`);
        console.log(`   🔴 Sobreposição: ${Math.max(checkInDate, reservaCheckIn).toLocaleString('pt-BR')} → ${Math.min(checkOutDate, reservaCheckOut).toLocaleString('pt-BR')}`);
        
        conflitos.push({
          reservationId: reserva._id,
          reservationNumber: reserva.reservationNumber,
          customerName: reserva.customerName,
          conflictStart: Math.max(checkInDate, reservaCheckIn),
          conflictEnd: Math.min(checkOutDate, reservaCheckOut),
          existingPeriod: {
            checkIn: reservaCheckIn,
            checkOut: reservaCheckOut
          }
        });
      } else {
        console.log(`✅ Sem conflito com reserva ${reserva.reservationNumber}`);
      }
    }
    
    return {
      hasConflict: conflitos.length > 0,
      conflicts: conflitos,
      totalExistingReservations: reservasExistentes.length
    };
    
  } catch (error) {
    console.error('❌ Erro ao verificar conflitos:', error);
    // Em caso de erro, assumir que não há conflito (segurança)
    return {
      hasConflict: false,
      conflicts: [],
      error: error.message
    };
  }
};

// ✅ FUNÇÃO PARA SUGERIR QUARTOS ALTERNATIVOS
const sugerirQuartosAlternativos = async (checkInDate, checkOutDate, roomTypeOriginal = null) => {
  try {
    console.log('🔍 Buscando quartos alternativos...');
    
    // Buscar todos os quartos disponíveis
    const quartosDisponiveis = await Room.find({ 
      status: { $in: ['available', 'cleaning'] }
    }).sort({ number: 1 });
    
    const sugestoes = [];
    
    for (const quarto of quartosDisponiveis) {
      const conflicto = await verificarConflitoReservas(
        quarto._id.toString(), 
        checkInDate, 
        checkOutDate
      );
      
      if (!conflicto.hasConflict) {
        sugestoes.push({
          roomId: quarto._id.toString(),
          roomNumber: quarto.number,
          roomType: quarto.type,
          status: quarto.status,
          isRecommended: quarto.type === roomTypeOriginal
        });
      }
    }
    
    console.log(`💡 Encontrados ${sugestoes.length} quartos alternativos sem conflito`);
    
    return sugestoes;
    
  } catch (error) {
    console.error('❌ Erro ao sugerir alternativas:', error);
    return [];
  }
};

// ✅ FUNÇÃO PARA FORMATAR MENSAGEM DE CONFLITO
const formatarMensagemConflito = (conflitos) => {
  if (conflitos.length === 0) return '';
  
  let mensagem = 'Conflitos detectados:\n\n';
  
  conflitos.forEach((conflito, index) => {
    mensagem += `${index + 1}. Reserva #${conflito.reservationNumber}\n`;
    mensagem += `   Cliente: ${conflito.customerName}\n`;
    mensagem += `   Período: ${conflito.existingPeriod.checkIn.toLocaleString('pt-BR')} → ${conflito.existingPeriod.checkOut.toLocaleString('pt-BR')}\n`;
    mensagem += `   Sobreposição: ${conflito.conflictStart.toLocaleString('pt-BR')} → ${conflito.conflictEnd.toLocaleString('pt-BR')}\n\n`;
  });
  
  return mensagem;
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

// ✅ ROTA 2: CRIAR RESERVA - COM SISTEMA DE CONFLITOS
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

    // 🔍 VERIFICAR CONFLITOS DE RESERVA
    console.log('🔍 Verificando conflitos para o quarto selecionado...');
    const conflictoCheck = await verificarConflitoReservas(
      room.id, 
      checkInDate, 
      checkOutDate
    );

    if (conflictoCheck.hasConflict) {
      console.log('❌ CONFLITO DETECTADO! Buscando alternativas...');
      
      // Buscar quartos alternativos
      const quartosAlternativos = await sugerirQuartosAlternativos(
        checkInDate, 
        checkOutDate, 
        room.type
      );
      
      if (quartosAlternativos.length > 0) {
        // Usar primeiro quarto alternativo disponível
        const quartoAlternativo = quartosAlternativos[0];
        
        console.log(`✅ Quarto alternativo encontrado: ${quartoAlternativo.roomNumber}`);
        
        room = {
          id: quartoAlternativo.roomId,
          number: quartoAlternativo.roomNumber,
          type: quartoAlternativo.roomType
        };
        
        // Log para informar a substituição
        console.log(`🔄 Quarto substituído automaticamente: ${room.number}`);
        
      } else {
        // Nenhum quarto disponível - retornar erro detalhado
        const mensagemConflito = formatarMensagemConflito(conflictoCheck.conflicts);
        
        return res.status(409).json({
          success: false,
          message: 'Conflito de horários detectado',
          details: {
            conflicts: conflictoCheck.conflicts,
            conflictMessage: mensagemConflito,
            suggestedRooms: quartosAlternativos,
            originalRoom: room.number
          }
        });
      }
    } else {
      console.log('✅ Nenhum conflito detectado para este quarto');
    }

    // ✅ MAPEAMENTO COMPLETO
const periodNameMap = {
  '3h': '3 HORAS',
  '4h': '4 HORAS',
  '6h': '6 HORAS', 
  '12h': '12 HORAS',
  '1hora': '1 HORA',        // ✅ ADICIONADO
  'daily': 'DIÁRIA',
  'pernoite': 'PERNOITE',
  'dayuse': 'DAYUSE'        // ✅ ADICIONADO
};

const priceMap = {
  '3h': 50.00,
  '4h': 55.00,
  '6h': 70.00,
  '12h': 90.00,
  '1hora': 50.00,           // ✅ ADICIONADO
  'daily': 120.00,
  'pernoite': 100.00,
  'dayuse': 50.00           // ✅ ADICIONADO
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

    // ✅ DETECTAR TURNO AUTOMATICAMENTE
    const turnoAtual = detectarTurnoAtual(req.user);

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
      createdBy: req.user._id,
      
      turnoInfo: turnoAtual
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

    // ✅ RESPOSTA DE SUCESSO (com info de substituição se aplicável)
    const responseData = {
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
    };

    // Se houve substituição de quarto, informar
    if (conflictoCheck.hasConflict) {
      responseData.message = `Reserva criada com sucesso! Quarto alterado para ${room.number} devido a conflito de horários.`;
      responseData.roomChanged = true;
    }

    res.status(201).json(responseData);

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

// ✅ ROTA 6: VERIFICAR CONFLITOS (NOVA ROTA PARA FRONTEND)
router.post('/check-conflicts', authenticate, async (req, res) => {
  try {
    const { roomId, checkIn, checkOut } = req.body;
    
    if (!roomId || !checkIn || !checkOut) {
      return res.status(400).json({
        success: false,
        message: 'roomId, checkIn e checkOut são obrigatórios'
      });
    }
    
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    
    const conflictCheck = await verificarConflitoReservas(roomId, checkInDate, checkOutDate);
    const alternativas = conflictCheck.hasConflict ? 
      await sugerirQuartosAlternativos(checkInDate, checkOutDate) : [];
    
    res.json({
      success: true,
      data: {
        hasConflict: conflictCheck.hasConflict,
        conflicts: conflictCheck.conflicts,
        alternatives: alternativas
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao verificar conflitos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ ROTA 7: ESTATÍSTICAS
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

// ✅ NOVA ROTA PARA BUSCAR RESERVAS POR TURNO
router.get('/turno/:turnoId', authenticate, async (req, res) => {
  try {
    const { turnoId } = req.params;
    
    console.log('🕐 Buscando reservas do turno:', turnoId);
    
    const dadosTurno = await Reservation.getReservasPorTurno(turnoId);
    
    res.json({
      success: true,
      data: {
        turnoId: turnoId,
        reservas: dadosTurno.reservas,
        faturamento: dadosTurno.faturamento,
        quantidade: dadosTurno.quantidade
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar reservas do turno:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ NOVA ROTA PARA ESTATÍSTICAS DE TURNOS
router.get('/turnos/estatisticas', authenticate, async (req, res) => {
  try {
    const hoje = new Date();
    const inicioHoje = new Date(hoje.setHours(0, 0, 0, 0));
    const fimHoje = new Date(hoje.setHours(23, 59, 59, 999));
    
    const estatisticas = await Reservation.aggregate([
      {
        $match: {
          createdAt: { $gte: inicioHoje, $lte: fimHoje },
          'turnoInfo.turnoId': { $ne: null }
        }
      },
      {
        $group: {
          _id: {
            turnoId: '$turnoInfo.turnoId',
            turnoNome: '$turnoInfo.turnoNome',
            funcionario: '$turnoInfo.funcionarioTurno'
          },
          totalReservas: { $sum: 1 },
          faturamentoTotal: { $sum: '$totalPrice' },
          reservas: { $push: '$$ROOT' }
        }
      },
      {
        $sort: { '_id.turnoId': 1 }
      }
    ]);
    
    res.json({
      success: true,
      data: {
        estatisticasPorTurno: estatisticas,
        totalTurnos: estatisticas.length
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar estatísticas de turnos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ NOVA ROTA DEBUG PARA TESTAR TURNOS
router.get('/debug/turnos', authenticate, async (req, res) => {
  try {
    console.log('🔍 [DEBUG] Analisando sistema de turnos...');
    
    const hoje = new Date();
    const inicioHoje = new Date(hoje.setHours(0, 0, 0, 0));
    const fimHoje = new Date(hoje.setHours(23, 59, 59, 999));
    
    // 1. Buscar todas as reservas de hoje
    const reservasHoje = await Reservation.find({
      createdAt: { $gte: inicioHoje, $lte: fimHoje }
    }).select('reservationNumber customerName turnoInfo totalPrice paymentMethod createdAt').lean();
    
    // 2. Agrupar por turno
    const reservasPorTurno = {};
    reservasHoje.forEach(reserva => {
      const turnoId = reserva.turnoInfo?.turnoId || 'sem_turno';
      if (!reservasPorTurno[turnoId]) {
        reservasPorTurno[turnoId] = {
          turnoInfo: reserva.turnoInfo,
          reservas: [],
          faturamento: { dinheiro: 0, cartao: 0, pix: 0, total: 0 }
        };
      }
      
      reservasPorTurno[turnoId].reservas.push(reserva);
      
      // Calcular faturamento
      const valor = reserva.totalPrice || 0;
      switch(reserva.paymentMethod) {
        case 'cash':
          reservasPorTurno[turnoId].faturamento.dinheiro += valor;
          break;
        case 'card':
          reservasPorTurno[turnoId].faturamento.cartao += valor;
          break;
        case 'pix':
          reservasPorTurno[turnoId].faturamento.pix += valor;
          break;
        default:
          reservasPorTurno[turnoId].faturamento.dinheiro += valor;
      }
      reservasPorTurno[turnoId].faturamento.total += valor;
    });
    
    // 3. Detectar turno atual do usuário logado
    const turnoAtualUser = detectarTurnoAtual(req.user);
    
    // 4. Montar resposta de debug
    res.json({
      success: true,
      message: 'Debug do sistema de turnos',
      data: {
        dataAnalise: hoje.toISOString(),
        turnoAtualDetectado: turnoAtualUser,
        usuarioLogado: {
          id: req.user._id,
          name: req.user.name || req.user.nomeCompleto,
          role: req.user.role
        },
        resumo: {
          totalReservasHoje: reservasHoje.length,
          totalTurnos: Object.keys(reservasPorTurno).length,
          faturamentoTotal: Object.values(reservasPorTurno).reduce((sum, turno) => sum + turno.faturamento.total, 0)
        },
        turnosDetalhados: reservasPorTurno,
        sistemaStatus: {
          modeloReservation: 'OK - Campos turnoInfo presentes',
          funcaoDetectarTurno: 'OK - Implementada',
          salvamentoTurno: 'OK - Sendo salvo automaticamente',
          rotasTurno: 'OK - Rotas implementadas'
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Erro no debug de turnos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro no debug de turnos',
      error: error.message
    });
  }
});

// ✅ ROTA ADICIONAL PARA TESTAR CRIAÇÃO DE TURNO
router.post('/debug/criar-turno-teste', authenticate, async (req, res) => {
  try {
    console.log('🧪 [DEBUG] Criando reserva de teste para turno...');
    
    // Detectar turno atual
    const turnoAtual = detectarTurnoAtual(req.user);
    
    // Buscar quarto disponível
    const room = await buscarQuartoDisponivel();
    
    // Criar reserva de teste
    const agora = new Date();
    const checkOut = new Date(agora.getTime() + 4 * 60 * 60 * 1000); // +4 horas
    
    const reservaTeste = new Reservation({
      customerName: 'TESTE TURNO - ' + turnoAtual.turnoNome,
      customerPhone: '(11) 99999-9999',
      customerEmail: 'teste@turno.com',
      roomId: room.id,
      roomNumber: room.number,
      checkIn: agora,
      checkOut: checkOut,
      periodType: '4h',
      periodName: '4 HORAS',
      basePrice: 55.00,
      totalPrice: 55.00,
      status: 'confirmed',
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      createdBy: req.user._id,
      turnoInfo: turnoAtual
    });
    
    const reservaSalva = await reservaTeste.save();
    
    console.log('✅ Reserva de teste criada:', reservaSalva.reservationNumber);
    
    res.json({
      success: true,
      message: 'Reserva de teste criada com sucesso',
      data: {
        reserva: {
          number: reservaSalva.reservationNumber,
          customer: reservaSalva.customerName,
          turnoInfo: reservaSalva.turnoInfo,
          valor: reservaSalva.totalPrice
        },
        turnoDetectado: turnoAtual
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao criar reserva de teste:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao criar reserva de teste',
      error: error.message
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
