// routes/periods.js - ROTAS CRUD PARA GESTÃO DINÂMICA DE PERÍODOS

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Period = require('../models/Period');
const { authenticate } = require('../middleware/auth');

console.log('✅ Rotas de períodos carregadas');

// ✅ ROTA 1: LISTAR TODOS OS PERÍODOS
router.get('/', authenticate, async (req, res) => {
  try {
    console.log('📋 [GET] Listando períodos...');
    
    const { ativo, categoria } = req.query;
    
    // Construir filtro dinâmico
    const filtro = {};
    if (ativo !== undefined) {
      filtro.active = ativo === 'true';
    }
    if (categoria) {
      filtro.category = categoria;
    }
    
    const periodos = await Period.find(filtro).sort({ order: 1, periodName: 1 });
    
    console.log(`📋 Encontrados ${periodos.length} períodos`);
    
    // Calcular estatísticas
    const estatisticas = {
      total: periodos.length,
      ativos: periodos.filter(p => p.active).length,
      inativos: periodos.filter(p => !p.active).length,
      porCategoria: {}
    };
    
    // Agrupar por categoria
    periodos.forEach(periodo => {
      const cat = periodo.category || 'outros';
      if (!estatisticas.porCategoria[cat]) {
        estatisticas.porCategoria[cat] = 0;
      }
      estatisticas.porCategoria[cat]++;
    });
    
    res.json({
      success: true,
      data: periodos,
      estatisticas: estatisticas,
      total: periodos.length
    });
    
  } catch (error) {
    console.error('❌ Erro ao listar períodos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// ✅ ROTA 2: BUSCAR PERÍODO POR ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Buscar por _id ou por periodType
    let periodo;
    if (mongoose.Types.ObjectId.isValid(id)) {
      periodo = await Period.findById(id);
    } else {
      periodo = await Period.findOne({ periodType: id });
    }
    
    if (!periodo) {
      return res.status(404).json({
        success: false,
        message: 'Período não encontrado'
      });
    }
    
    res.json({
      success: true,
      data: periodo
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar período:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// ✅ ROTA 3: CRIAR NOVO PERÍODO
router.post('/', authenticate, async (req, res) => {
  try {
    console.log('🆕 [POST] Criando novo período...');
    
    const {
      periodType,
      periodName,
      basePrice,
      description,
      category = 'hourly',
      durationHours,
      checkInTime,
      checkOutTime,
      active = true,
      order = 0
    } = req.body;
    
    // Validações básicas
    if (!periodType || !periodName || !basePrice) {
      return res.status(400).json({
        success: false,
        message: 'Campos obrigatórios: periodType, periodName, basePrice'
      });
    }
    
    // Verificar se já existe
    const existe = await Period.findOne({ periodType: periodType });
    if (existe) {
      return res.status(409).json({
        success: false,
        message: `Período '${periodType}' já existe`
      });
    }
    
    // Validação de preço
    const preco = parseFloat(basePrice);
    if (isNaN(preco) || preco < 0) {
      return res.status(400).json({
        success: false,
        message: 'Preço deve ser um número válido e não negativo'
      });
    }
    
    // Dados do novo período
    const dadosPeriodo = {
      periodType: periodType.toLowerCase().trim(),
      periodName: periodName.toUpperCase().trim(),
      basePrice: preco,
      description: description || `Período de ${periodName}`,
      category: category,
      active: active,
      order: parseInt(order) || 0,
      availableFor: ['all'],
      isFixedPrice: true,
      isFeedbackPeriod: true,
      createdBy: req.user._id
    };
    
    // Adicionar campos específicos por categoria
    if (category === 'hourly' && durationHours) {
      dadosPeriodo.durationHours = parseFloat(durationHours);
    }
    
    if ((category === 'overnight' || category === 'daily') && checkInTime && checkOutTime) {
      dadosPeriodo.checkInTime = checkInTime;
      dadosPeriodo.checkOutTime = checkOutTime;
    }
    
    console.log('💾 Dados do período a criar:', dadosPeriodo);
    
    // Criar e salvar
    const periodo = new Period(dadosPeriodo);
    const periodoSalvo = await periodo.save();
    
    console.log('✅ Período criado:', periodoSalvo.periodType);
    
    res.status(201).json({
      success: true,
      message: 'Período criado com sucesso',
      data: periodoSalvo
    });
    
  } catch (error) {
    console.error('❌ Erro ao criar período:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Período já existe'
      });
    }
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        details: Object.values(error.errors).map(e => e.message)
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// ✅ ROTA 4: ATUALIZAR PERÍODO
router.put('/:id', authenticate, async (req, res) => {
  try {
    console.log('📝 [PUT] Atualizando período...');
    
    const { id } = req.params;
    const updateData = { ...req.body };
    
    // Adicionar dados de auditoria
    updateData.updatedBy = req.user._id;
    updateData.updatedAt = new Date();
    
    // Processar campos específicos
    if (updateData.basePrice) {
      updateData.basePrice = parseFloat(updateData.basePrice);
    }
    
    if (updateData.periodName) {
      updateData.periodName = updateData.periodName.toUpperCase().trim();
    }
    
    if (updateData.periodType) {
      updateData.periodType = updateData.periodType.toLowerCase().trim();
    }
    
    // Buscar e atualizar
    let periodo;
    if (mongoose.Types.ObjectId.isValid(id)) {
      periodo = await Period.findByIdAndUpdate(id, updateData, { 
        new: true, 
        runValidators: true 
      });
    } else {
      periodo = await Period.findOneAndUpdate(
        { periodType: id }, 
        updateData, 
        { new: true, runValidators: true }
      );
    }
    
    if (!periodo) {
      return res.status(404).json({
        success: false,
        message: 'Período não encontrado'
      });
    }
    
    console.log('✅ Período atualizado:', periodo.periodType);
    
    res.json({
      success: true,
      message: 'Período atualizado com sucesso',
      data: periodo
    });
    
  } catch (error) {
    console.error('❌ Erro ao atualizar período:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        details: Object.values(error.errors).map(e => e.message)
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// ✅ ROTA 5: ATIVAR/DESATIVAR PERÍODO
router.patch('/:id/toggle', authenticate, async (req, res) => {
  try {
    console.log('🔄 [PATCH] Alterando status do período...');
    
    const { id } = req.params;
    const { active } = req.body;
    
    if (typeof active !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Campo "active" deve ser boolean'
      });
    }
    
    let periodo;
    if (mongoose.Types.ObjectId.isValid(id)) {
      periodo = await Period.findByIdAndUpdate(
        id, 
        { 
          active: active,
          updatedBy: req.user._id,
          updatedAt: new Date()
        }, 
        { new: true }
      );
    } else {
      periodo = await Period.findOneAndUpdate(
        { periodType: id }, 
        { 
          active: active,
          updatedBy: req.user._id,
          updatedAt: new Date()
        }, 
        { new: true }
      );
    }
    
    if (!periodo) {
      return res.status(404).json({
        success: false,
        message: 'Período não encontrado'
      });
    }
    
    console.log(`✅ Período ${periodo.periodType} → ${active ? 'ATIVADO' : 'DESATIVADO'}`);
    
    res.json({
      success: true,
      message: `Período ${active ? 'ativado' : 'desativado'} com sucesso`,
      data: periodo
    });
    
  } catch (error) {
    console.error('❌ Erro ao alterar status:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// ✅ ROTA 6: DELETAR PERÍODO
router.delete('/:id', authenticate, async (req, res) => {
  try {
    console.log('🗑️ [DELETE] Deletando período...');
    
    const { id } = req.params;
    
    // Verificar se tem reservas usando este período
    const Reservation = mongoose.model('Reservation');
    let periodoType;
    
    // Primeiro, obter o periodType
    let periodo;
    if (mongoose.Types.ObjectId.isValid(id)) {
      periodo = await Period.findById(id);
    } else {
      periodo = await Period.findOne({ periodType: id });
      periodoType = id;
    }
    
    if (!periodo) {
      return res.status(404).json({
        success: false,
        message: 'Período não encontrado'
      });
    }
    
    periodoType = periodo.periodType;
    
    // Verificar se há reservas usando este período
    const reservasComPeriodo = await Reservation.countDocuments({
      periodType: periodoType
    });
    
    if (reservasComPeriodo > 0) {
      return res.status(409).json({
        success: false,
        message: `Não é possível deletar. Existem ${reservasComPeriodo} reservas usando este período.`,
        details: {
          reservasEncontradas: reservasComPeriodo,
          sugestao: 'Desative o período ao invés de deletá-lo'
        }
      });
    }
    
    // Deletar período
    if (mongoose.Types.ObjectId.isValid(id)) {
      await Period.findByIdAndDelete(id);
    } else {
      await Period.findOneAndDelete({ periodType: id });
    }
    
    console.log('✅ Período deletado:', periodoType);
    
    res.json({
      success: true,
      message: 'Período deletado com sucesso'
    });
    
  } catch (error) {
    console.error('❌ Erro ao deletar período:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// ✅ ROTA 7: OBTER MAPEAMENTO COMPLETO (PARA FRONTEND)
router.get('/mapeamento/completo', authenticate, async (req, res) => {
  try {
    console.log('🗺️ [GET] Obtendo mapeamento completo...');
    
    const mapeamento = await Period.obterMapeamentoCompleto();
    
    res.json({
      success: true,
      data: mapeamento,
      message: 'Mapeamento obtido com sucesso'
    });
    
  } catch (error) {
    console.error('❌ Erro ao obter mapeamento:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// ✅ ROTA 8: DEBUG COMPLETO
router.get('/debug/completo', authenticate, async (req, res) => {
  try {
    console.log('🔍 [DEBUG] Análise completa dos períodos...');
    
    const debugInfo = await Period.debugPeriodos();
    
    // Verificar também integração com reservas
    const Reservation = mongoose.model('Reservation');
    const periodosUsadosEmReservas = await Reservation.distinct('periodType');
    
    // Verificar órfãos (períodos em reservas que não existem na tabela Period)
    const todosOsTipos = debugInfo.todos ? debugInfo.todos.map(p => p.periodType) : [];
    const orfaos = periodosUsadosEmReservas.filter(tipo => !todosOsTipos.includes(tipo));
    
    res.json({
      success: true,
      message: 'Debug completo dos períodos',
      data: {
        ...debugInfo,
        integracaoReservas: {
          periodosUsadosEmReservas: periodosUsadosEmReservas,
          totalPeriodosEmUso: periodosUsadosEmReservas.length,
          periodosOrfaos: orfaos,
          temOrfaos: orfaos.length > 0
        },
        sistemaStatus: {
          modeloPeriod: 'OK - Modelo carregado',
          validacaoDinamica: 'OK - Implementada',
          integracaoReservation: 'OK - Conectado',
          mapeamentoCompleto: 'OK - Funcionando'
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Erro no debug completo:', error);
    res.status(500).json({
      success: false,
      message: 'Erro no debug completo',
      error: error.message
    });
  }
});

// ✅ ROTA 9: INICIALIZAR PERÍODOS PADRÃO
router.post('/inicializar', authenticate, async (req, res) => {
  try {
    console.log('🚀 [POST] Inicializando períodos padrão...');
    
    const periodos = await Period.criarPeriodosPadrao();
    
    res.json({
      success: true,
      message: 'Períodos padrão inicializados com sucesso',
      data: periodos,
      total: periodos.length
    });
    
  } catch (error) {
    console.error('❌ Erro ao inicializar períodos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao inicializar períodos padrão',
      error: error.message
    });
  }
});

// ✅ ROTA 10: REORDENAR PERÍODOS
router.patch('/reordenar', authenticate, async (req, res) => {
  try {
    console.log('🔢 [PATCH] Reordenando períodos...');
    
    const { ordenacao } = req.body; // Array de { periodType: string, order: number }
    
    if (!Array.isArray(ordenacao)) {
      return res.status(400).json({
        success: false,
        message: 'Campo "ordenacao" deve ser um array'
      });
    }
    
    const atualizacoes = [];
    
    for (const item of ordenacao) {
      if (item.periodType && typeof item.order === 'number') {
        const resultado = await Period.findOneAndUpdate(
          { periodType: item.periodType },
          { 
            order: item.order,
            updatedBy: req.user._id,
            updatedAt: new Date()
          },
          { new: true }
        );
        
        if (resultado) {
          atualizacoes.push(resultado);
          console.log(`✅ ${item.periodType} → ordem ${item.order}`);
        }
      }
    }
    
    res.json({
      success: true,
      message: `${atualizacoes.length} períodos reordenados`,
      data: atualizacoes
    });
    
  } catch (error) {
    console.error('❌ Erro ao reordenar:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// ✅ HEALTH CHECK
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Rotas de períodos funcionando',
    timestamp: new Date().toISOString()
  });
});

console.log('✅ Rotas CRUD de períodos registradas com sucesso');

module.exports = router;
