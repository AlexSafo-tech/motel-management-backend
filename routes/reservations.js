// routes/reservations.js - VERSÃO CORRIGIDA PARA MONGODB REAL

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Reservation = require('../models/Reservation');
const Room = require('../models/Room');
const Period = require('../models/Period');
const { authenticate } = require('../middleware/auth');

console.log('✅ Modelo Reservation importado com sucesso');

// ✅ FUNÇÃO CORRIGIDA PARA BUSCAR PERÍODOS DO MONGODB REAL
const buscarPeriodosDoMongo = async () => {
  try {
    console.log('📊 Buscando períodos ativos do MongoDB...');
    
    // ✅ BUSCAR PERÍODOS ATIVOS - QUERY CORRIGIDA
    const periodos = await Period.find({ 
      active: true  // ✅ Campo correto conforme a imagem
    }).sort({ order: 1 });
    
    console.log(`✅ ${periodos.length} períodos encontrados no MongoDB`);
    
    if (periodos.length === 0) {
      console.warn('⚠️ Nenhum período encontrado! Verificando se existem períodos...');
      const totalPeriodos = await Period.countDocuments();
      console.log(`📊 Total de períodos no banco: ${totalPeriodos}`);
      
      if (totalPeriodos > 0) {
        console.log('📋 Buscando TODOS os períodos para debug...');
        const todosPeriodos = await Period.find({});
        todosPeriodos.forEach(p => {
          console.log(`🔍 Período encontrado: ${p.periodType} | Nome: ${p.periodName} | Ativo: ${p.active} | Preço: ${p.basePrice}`);
        });
      }
    }
    
    // ✅ CRIAR MAPEAMENTOS DINÂMICOS BASEADOS NA ESTRUTURA REAL
    const periodNameMap = {};
    const priceMap = {};
    const enumValidos = [];
    
    periodos.forEach(periodo => {
      const tipo = periodo.periodType;        // ✅ Campo correto
      const nome = periodo.periodName;        // ✅ Campo correto
      const preco = periodo.basePrice || 50;  // ✅ Campo correto
      
      periodNameMap[tipo] = nome;
      priceMap[tipo] = preco;
      enumValidos.push(tipo);
      
      console.log(`📋 Período mapeado: ${tipo} → ${nome} (R$ ${preco})`);
    });
    
    // ✅ SE NÃO ENCONTROU NENHUM PERÍODO ATIVO, BUSCAR TODOS COMO FALLBACK
    if (enumValidos.length === 0) {
      console.warn('⚠️ Nenhum período ativo encontrado! Buscando todos os períodos como fallback...');
      
      const todosPeriodos = await Period.find({});
      todosPeriodos.forEach(periodo => {
        const tipo = periodo.periodType;
        const nome = periodo.periodName;
        const preco = periodo.basePrice || 50;
        
        periodNameMap[tipo] = nome;
        priceMap[tipo] = preco;
        enumValidos.push(tipo);
        
        console.log(`📋 Período fallback: ${tipo} → ${nome} (R$ ${preco}) | Ativo: ${periodo.active}`);
      });
    }
    
    return {
      periodNameMap,
      priceMap,
      enumValidos,
      periodos: periodos.length > 0 ? periodos : await Period.find({})
    };
    
  } catch (error) {
    console.error('❌ Erro ao buscar períodos do MongoDB:', error);
    
    // ✅ FALLBACK MELHORADO - INCLUIR 1HORA
    return {
      periodNameMap: {
        '1hora': '1 HORA',
        'pernoite': 'PERNOITE', 
        'daily': 'DIÁRIA',
        '4h': '4 HORAS',
        '6h': '6 HORAS',
        '12h': '12 HORAS'
      },
      priceMap: {
        '1hora': 50.00,
        'pernoite': 100.00,
        'daily': 120.00,
        '4h': 55.00,
        '6h': 70.00,
        '12h': 90.00
      },
      enumValidos: ['1hora', 'pernoite', 'daily', '4h', '6h', '12h'],
      periodos: []
    };
  }
};

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
    
    const query = {
      roomId: roomId,
      status: { $in: ['confirmed', 'checked-in'] },
    };
    
    if (excludeReservationId) {
      query._id = { $ne: excludeReservationId };
    }
    
    const reservasExistentes = await Reservation.find(query);
    console.log(`📋 Encontradas ${reservasExistentes.length} reservas ativas para este quarto`);
    
    const conflitos = [];
    
    for (const reserva of reservasExistentes) {
      const reservaCheckIn = new Date(reserva.checkIn);
      const reservaCheckOut = new Date(reserva.checkOut);
      
      const temConflito = (
        checkInDate < reservaCheckOut && checkOutDate > reservaCheckIn
      );
      
      if (temConflito) {
        console.log(`❌ CONFLITO DETECTADO com reserva ${reserva.reservationNumber}!`);
        
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
      }
    }
    
    return {
      hasConflict: conflitos.length > 0,
      conflicts: conflitos,
      totalExistingReservations: reservasExistentes.length
    };
    
  } catch (error) {
    console.error('❌ Erro ao verificar conflitos:', error);
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

// ✅ GESTÃO INTELIGENTE DO QUARTO
const gerenciarStatusQuarto = async (roomId, operacao, dadosReserva = {}) => {
  try {
    if (!roomId || roomId === 'room-default') return;
    
    const { checkInDate, checkOutDate } = dadosReserva;
    let novoStatus = 'available';
    
    switch (operacao) {
      case 'criar_reserva':
        const now = new Date();
        const checkIn = new Date(checkInDate);
        const isImmediate = checkIn <= now || checkIn.toDateString() === now.toDateString();
        
        if (isImmediate) {
          novoStatus = 'occupied';
          console.log(`🔒 Quarto ${roomId} bloqueado para reserva imediata`);
        } else {
          console.log(`📅 Quarto ${roomId} mantido disponível - reserva futura`);
          return;
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

// ✅ ROTA 1: LISTAR RESERVAS - COM NOMES DINÂMICOS DO MONGODB
router.get('/', authenticate, async (req, res) => {
  try {
    console.log('📋 [GET] Listando reservas...');
    
    // ✅ BUSCAR PERÍODOS PARA MAPEAMENTO DINÂMICO
    const { periodNameMap } = await buscarPeriodosDoMongo();
    
    const reservations = await Reservation.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    console.log(`📋 Encontradas ${reservations.length} reservas`);

    const formattedReservations = reservations.map(reservation => {
      // ✅ USAR NOME DINÂMICO DO MONGODB OU FALLBACK
      const periodoNome = periodNameMap[reservation.periodType] || 
                          reservation.periodName || 
                          reservation.periodType || 
                          'Período não definido';
      
      return {
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
        
        // ✅ COMPATIBILIDADE COM FRONTEND (USANDO NOMES DINÂMICOS DO MONGODB)
        cliente: {
          nome: reservation.customerName || 'Cliente não informado',
          telefone: reservation.customerPhone || ''
        },
        data: reservation.checkIn ? new Date(reservation.checkIn).toLocaleDateString('pt-BR') : 'N/A',
        periodo: periodoNome, // ✅ NOME DINÂMICO DO MONGODB
        valor: (reservation.totalPrice || 50.00).toFixed(2)
      };
    });

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

// ✅ ROTA 2: CRIAR RESERVA - COM DADOS 100% DINÂMICOS DO MONGODB
router.post('/', authenticate, async (req, res) => {
  try {
    console.log('🆕 [POST] Criando nova reserva...');
    
    // ✅ BUSCAR DADOS DINÂMICOS DO MONGODB REAL
    const { periodNameMap, priceMap, enumValidos } = await buscarPeriodosDoMongo();
    
    console.log('🔍 === DADOS DINÂMICOS CARREGADOS ===');
    console.log('📊 Tipos disponíveis:', enumValidos);
    console.log('📊 Total períodos:', Object.keys(periodNameMap).length);
    console.log('📊 Preços:', priceMap);

    const {
      checkIn,
      checkOut,
      periodType = '4h',
      roomId,
      totalPrice,
      paymentMethod = 'Dinheiro',
      customerName,
      customerPhone,
      customerEmail, 
      customerDocument
    } = req.body;

    console.log('🔍 === VALIDAÇÃO DINÂMICA ===');
    console.log('📝 Período recebido:', periodType);
    console.log('✅ Períodos válidos do MongoDB:', enumValidos);
    console.log('✅ Período é válido:', enumValidos.includes(periodType));

    // ✅ VALIDAÇÃO DINÂMICA BASEADA NO MONGODB REAL
    if (!enumValidos.includes(periodType)) {
      console.error('❌ Período não encontrado no MongoDB:', periodType);
      return res.status(400).json({
        success: false,
        message: `Tipo de período '${periodType}' não está ativo no sistema`,
        debug: {
          periodTypeReceived: periodType,
          availablePeriods: enumValidos,
          totalPeriodsFound: enumValidos.length
        },
        periodosDisponiveis: enumValidos,
        periodosDetalhados: Object.keys(periodNameMap).map(tipo => ({
          tipo,
          nome: periodNameMap[tipo],
          preco: priceMap[tipo]
        }))
      });
    }

    // ✅ VALIDAÇÕES BÁSICAS
    if (!checkIn || !checkOut) {
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
    const conflictoCheck = await verificarConflitoReservas(
      room.id, 
      checkInDate, 
      checkOutDate
    );

    if (conflictoCheck.hasConflict) {
      console.log('❌ CONFLITO DETECTADO! Buscando alternativas...');
      
      const quartosAlternativos = await sugerirQuartosAlternativos(
        checkInDate, 
        checkOutDate, 
        room.type
      );
      
      if (quartosAlternativos.length > 0) {
        const quartoAlternativo = quartosAlternativos[0];
        
        room = {
          id: quartoAlternativo.roomId,
          number: quartoAlternativo.roomNumber,
          type: quartoAlternativo.roomType
        };
        
        console.log(`🔄 Quarto substituído automaticamente: ${room.number}`);
        
      } else {
        return res.status(409).json({
          success: false,
          message: 'Conflito de horários detectado',
          details: {
            conflicts: conflictoCheck.conflicts,
            originalRoom: room.number
          }
        });
      }
    }

    // ✅ USAR PREÇO DINÂMICO DO MONGODB REAL
    let finalPrice = parseFloat(totalPrice) || priceMap[periodType] || 50.00;
    
    console.log('💰 === PREÇO DINÂMICO DO MONGODB ===');
    console.log('💰 Preço enviado pelo frontend:', totalPrice);
    console.log('💰 Preço do MongoDB para', periodType, ':', priceMap[periodType]);
    console.log('💰 Preço final usado:', finalPrice);

    // ✅ MAPEAR PAGAMENTO
    const paymentMethodMap = {
      'Dinheiro': 'cash',
      'Cartão': 'card', 
      'Pix': 'pix',
      'Transferência': 'transfer'
    };

    const finalPaymentMethod = paymentMethodMap[paymentMethod] || 'cash';

    // ✅ PROCESSAR NOME DO CLIENTE
    let finalCustomerName = 'Cliente não informado';
    
    if (customerName && typeof customerName === 'string' && customerName.trim() !== '') {
      finalCustomerName = customerName.trim();
    }

    // ✅ DETECTAR TURNO AUTOMATICAMENTE
    const turnoAtual = detectarTurnoAtual(req.user);

    // ✅ USAR NOME DINÂMICO DO MONGODB REAL
    const periodName = periodNameMap[periodType] || periodType;
    
    console.log('📛 === NOME DINÂMICO DO MONGODB ===');
    console.log('📛 Nome do MongoDB para', periodType, ':', periodName);

    // ✅ DADOS PARA SALVAR (USANDO VALORES 100% DINÂMICOS DO MONGODB)
    const reservationData = {
      customerName: finalCustomerName,
      customerPhone: (customerPhone && typeof customerPhone === 'string') ? customerPhone.trim() : '',
      customerEmail: (customerEmail && typeof customerEmail === 'string') ? customerEmail.trim() : '',
      customerDocument: (customerDocument && typeof customerDocument === 'string') ? customerDocument.trim() : '',
      
      roomId: room.id,
      roomNumber: room.number,
      
      checkIn: checkInDate,
      checkOut: checkOutDate,
      
      periodType: periodType,           // ✅ Tipo validado dinamicamente
      periodName: periodName,           // ✅ Nome dinâmico do MongoDB
      
      basePrice: finalPrice,            // ✅ Preço dinâmico do MongoDB
      totalPrice: finalPrice,           // ✅ Preço dinâmico do MongoDB
      
      status: 'confirmed',
      paymentMethod: finalPaymentMethod,
      paymentStatus: 'paid',
      
      notes: `Cliente: ${finalCustomerName} | Tel: ${customerPhone || 'N/A'} | Pagto: ${paymentMethod || 'N/A'}`,
      createdBy: req.user._id,
      
      turnoInfo: turnoAtual
    };

    console.log('💾 === DADOS FINAIS (100% DINÂMICOS DO MONGODB) ===');
    console.log('👤 Nome:', reservationData.customerName);
    console.log('🕐 Período:', reservationData.periodType);
    console.log('📛 Nome período:', reservationData.periodName);
    console.log('💰 Preço:', reservationData.totalPrice);

    // ✅ CRIAR E SALVAR RESERVA
    const reservation = new Reservation(reservationData);
    const savedReservation = await reservation.save();

    console.log('✅ Reserva salva com sucesso:', savedReservation.reservationNumber);

    // ✅ GESTÃO INTELIGENTE DO QUARTO
    await gerenciarStatusQuarto(room.id, 'criar_reserva', {
      checkInDate: checkInDate,
      checkOutDate: checkOutDate,
      status: 'confirmed'
    });

    // ✅ RESPOSTA DE SUCESSO
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

// ✅ NOVA ROTA PARA DEBUG DOS PERÍODOS DO MONGODB REAL
router.get('/debug/periodos-mongodb', authenticate, async (req, res) => {
  try {
    console.log('🔍 [DEBUG] Analisando períodos do MongoDB...');
    
    // ✅ BUSCAR TODOS OS PERÍODOS PARA DEBUG
    const todosPeriodos = await Period.find({});
    const periodosAtivos = await Period.find({ active: true });
    
    console.log(`📊 Total períodos no banco: ${todosPeriodos.length}`);
    console.log(`📊 Períodos ativos: ${periodosAtivos.length}`);
    
    // ✅ BUSCAR COM FUNÇÃO DINÂMICA
    const { periodNameMap, priceMap, enumValidos, periodos } = await buscarPeriodosDoMongo();
    
    res.json({
      success: true,
      message: 'Debug completo dos períodos do MongoDB',
      data: {
        totalPeriodosNoBanco: todosPeriodos.length,
        periodosAtivos: periodosAtivos.length,
        periodosEncontradosPelaFuncao: periodos.length,
        enumValidos: enumValidos,
        mapeamentoNomes: periodNameMap,
        mapeamentoPrecos: priceMap,
        
        // ✅ TODOS OS PERÍODOS DO BANCO
        todosPeriodos: todosPeriodos.map(p => ({
          id: p._id,
          periodType: p.periodType,
          periodName: p.periodName,
          basePrice: p.basePrice,
          active: p.active,
          order: p.order,
          category: p.category,
          description: p.description
        })),
        
        // ✅ APENAS OS ATIVOS
        periodosAtivos: periodosAtivos.map(p => ({
          id: p._id,
          periodType: p.periodType,
          periodName: p.periodName,
          basePrice: p.basePrice,
          order: p.order
        })),
        
        // ✅ STATUS DA FUNÇÃO
        statusFuncaoBusca: {
          funcionou: enumValidos.length > 0,
          quantidadeEncontrada: enumValidos.length,
          temFallback: enumValidos.includes('1hora')
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Erro no debug de períodos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar períodos para debug',
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

    // ✅ GESTÃO INTELIGENTE DO QUARTO
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

// ✅ OUTRAS ROTAS MANTIDAS...
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

// ✅ ROTAS DE ESTATÍSTICAS E TURNOS MANTIDAS...
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

router.get('/turno/:turnoId', authenticate, async (req, res) => {
  try {
    const { turnoId } = req.params;
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

// ✅ HEALTH CHECK
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Rotas de reservas funcionando com dados dinâmicos do MongoDB',
    timestamp: new Date().toISOString()
  });
});

console.log('✅ Rotas de reservas registradas com dados 100% dinâmicos do MongoDB');

module.exports = router;
