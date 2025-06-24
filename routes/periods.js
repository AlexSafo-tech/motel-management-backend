// routes/periods.js - CRIAR ESTE ARQUIVO
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// Middleware para logs específicos de períodos
router.use((req, res, next) => {
  console.log(`⏰ [PERIODS] ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// ✅ 1. GET /api/periods - Buscar todos os períodos
router.get('/', async (req, res) => {
  try {
    console.log('📋 Buscando todos os períodos...');
    
    // Acessar MongoDB através do app (será configurado no server.js)
    const db = req.app.locals.db;
    
    const periods = await db.collection('products').find({
      active: true
    }).sort({ order: 1 }).toArray();
    
    console.log(`✅ ${periods.length} períodos encontrados`);
    
    res.json({
      success: true,
      data: periods,
      message: `${periods.length} períodos carregados`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao buscar períodos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar períodos',
      error: error.message
    });
  }
});

// ✅ 2. GET /api/periods/available - Buscar períodos por data (hoje vs futuro)
router.get('/available', async (req, res) => {
  try {
    const { date, roomId } = req.query;
    
    console.log(`📅 Buscando períodos para: ${date || 'hoje'}, quarto: ${roomId || 'qualquer'}`);
    
    const db = req.app.locals.db;
    
    // Determinar se é "hoje" ou "futuro"
    const today = new Date().toISOString().split('T')[0];
    const isToday = date === today || !date;
    
    console.log(`📊 Tipo de reserva: ${isToday ? 'HOJE' : 'FUTURO'}`);
    
    // Buscar períodos baseado no tipo de reserva
    const availableForFilter = isToday ? 'today' : 'future';
    
    const periods = await db.collection('products').find({
      active: true,
      availableFor: availableForFilter
    }).sort({ order: 1 }).toArray();
    
    console.log(`✅ ${periods.length} períodos disponíveis para ${isToday ? 'hoje' : 'data futura'}`);
    console.log('📋 Períodos:', periods.map(p => p.periodName));
    
    res.json({
      success: true,
      data: periods,
      isToday,
      availableFor: availableForFilter,
      message: `${periods.length} períodos disponíveis`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao buscar períodos disponíveis:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar períodos disponíveis',
      error: error.message
    });
  }
});

// ✅ 3. POST /api/periods - Criar novo período
router.post('/', async (req, res) => {
  try {
    const periodData = req.body;
    
    console.log('➕ Criando novo período:', periodData.periodName);
    console.log('📦 Dados recebidos:', periodData);
    
    const db = req.app.locals.db;
    
    // Verificar se já existe
    const existing = await db.collection('products').findOne({
      periodType: periodData.periodType
    });
    
    if (existing) {
      console.log(`⚠️ Período ${periodData.periodType} já existe`);
      return res.status(400).json({
        success: false,
        message: `Período ${periodData.periodType} já existe`
      });
    }
    
    // Criar período com dados completos
    const newPeriod = {
      ...periodData,
      createdAt: new Date(),
      updatedAt: new Date(),
      active: periodData.active !== undefined ? periodData.active : true
    };
    
    console.log('💾 Salvando período:', newPeriod);
    
    const result = await db.collection('products').insertOne(newPeriod);
    
    console.log('✅ Período criado com ID:', result.insertedId);
    
    res.status(201).json({
      success: true,
      data: { _id: result.insertedId, ...newPeriod },
      message: `Período ${periodData.periodName} criado com sucesso`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao criar período:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao criar período',
      error: error.message
    });
  }
});

// ✅ 4. PUT /api/periods/:id - Atualizar período
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    console.log(`📝 Atualizando período ${id}...`);
    console.log('📦 Dados de atualização:', updateData);
    
    const db = req.app.locals.db;
    
    const result = await db.collection('products').updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          ...updateData, 
          updatedAt: new Date() 
        } 
      }
    );
    
    if (result.matchedCount === 0) {
      console.log(`❌ Período ${id} não encontrado`);
      return res.status(404).json({
        success: false,
        message: 'Período não encontrado'
      });
    }
    
    console.log('✅ Período atualizado com sucesso');
    
    res.json({
      success: true,
      message: 'Período atualizado com sucesso',
      modifiedCount: result.modifiedCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao atualizar período:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar período',
      error: error.message
    });
  }
});

// ✅ 5. DELETE /api/periods/:id - Deletar período
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`🗑️ Deletando período ${id}...`);
    
    const db = req.app.locals.db;
    
    // Buscar período antes de deletar para log
    const periodo = await db.collection('products').findOne({
      _id: new ObjectId(id)
    });
    
    if (!periodo) {
      console.log(`❌ Período ${id} não encontrado para deletar`);
      return res.status(404).json({
        success: false,
        message: 'Período não encontrado'
      });
    }
    
    const result = await db.collection('products').deleteOne({
      _id: new ObjectId(id)
    });
    
    console.log(`✅ Período "${periodo.periodName}" deletado com sucesso`);
    
    res.json({
      success: true,
      message: `Período "${periodo.periodName}" deletado com sucesso`,
      deletedPeriod: periodo.periodName,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao deletar período:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao deletar período',
      error: error.message
    });
  }
});

// ✅ 6. PATCH /api/periods/:id/toggle - Ativar/Desativar período
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`🔄 Alternando status do período ${id}...`);
    
    const db = req.app.locals.db;
    
    const period = await db.collection('products').findOne({
      _id: new ObjectId(id)
    });
    
    if (!period) {
      console.log(`❌ Período ${id} não encontrado`);
      return res.status(404).json({
        success: false,
        message: 'Período não encontrado'
      });
    }
    
    const newStatus = !period.active;
    
    await db.collection('products').updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          active: newStatus,
          updatedAt: new Date() 
        } 
      }
    );
    
    console.log(`✅ Período "${period.periodName}" ${newStatus ? 'ativado' : 'desativado'}`);
    
    res.json({
      success: true,
      data: { 
        _id: id,
        periodName: period.periodName,
        active: newStatus 
      },
      message: `Período "${period.periodName}" ${newStatus ? 'ativado' : 'desativado'} com sucesso`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao alterar status do período:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao alterar status do período',
      error: error.message
    });
  }
});

// ✅ 7. POST /api/periods/calculate-price - Calcular preço do período
router.post('/calculate-price', async (req, res) => {
  try {
    const { periodType, checkIn, checkOut, roomId } = req.body;
    
    console.log(`💰 Calculando preço para período: ${periodType}`);
    console.log('📋 Dados:', { periodType, checkIn, checkOut, roomId });
    
    const db = req.app.locals.db;
    
    // Buscar dados do período no banco
    const periodo = await db.collection('products').findOne({
      periodType: periodType,
      active: true
    });
    
    if (!periodo) {
      console.log(`⚠️ Período ${periodType} não encontrado, usando preço padrão`);
      return res.json({
        success: true,
        data: {
          basePrice: 50.00,
          totalPrice: 50.00,
          periodType,
          source: 'fallback',
          warning: 'Período não encontrado, preço padrão aplicado'
        },
        message: 'Preço calculado (fallback)'
      });
    }
    
    let valorFinal = periodo.basePrice;
    let calculoDetalhes = {
      periodType,
      basePrice: periodo.basePrice,
      metodCalculo: 'preco_fixo',
      periodData: periodo
    };
    
    // Lógica especial para pernoite
    if (periodType === 'pernoite') {
      valorFinal = periodo.basePrice; // Sempre preço fixo
      calculoDetalhes.metodCalculo = 'preco_fixo_pernoite';
      calculoDetalhes.observacao = 'Preço fixo independente do horário de check-in';
      console.log('🌙 Pernoite detectado - aplicando preço fixo');
    }
    
    console.log(`✅ Preço calculado: R$ ${valorFinal.toFixed(2)}`);
    
    res.json({
      success: true,
      data: {
        basePrice: valorFinal,
        totalPrice: valorFinal,
        periodType,
        periodName: periodo.periodName,
        calculoDetalhes,
        source: 'database'
      },
      message: 'Preço calculado com sucesso',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao calcular preço:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao calcular preço',
      error: error.message
    });
  }
});

// ✅ 8. GET /api/periods/stats - Estatísticas dos períodos
router.get('/stats', async (req, res) => {
  try {
    console.log('📊 Gerando estatísticas dos períodos...');
    
    const db = req.app.locals.db;
    
    const totalPeriods = await db.collection('products').countDocuments();
    const activePeriods = await db.collection('products').countDocuments({ active: true });
    const todayPeriods = await db.collection('products').countDocuments({ 
      active: true, 
      availableFor: 'today' 
    });
    const futurePeriods = await db.collection('products').countDocuments({ 
      active: true, 
      availableFor: 'future' 
    });
    
    const priceRange = await db.collection('products').aggregate([
      { $match: { active: true } },
      { $group: {
        _id: null,
        minPrice: { $min: '$basePrice' },
        maxPrice: { $max: '$basePrice' },
        avgPrice: { $avg: '$basePrice' }
      }}
    ]).toArray();
    
    const stats = {
      total: totalPeriods,
      active: activePeriods,
      inactive: totalPeriods - activePeriods,
      todayPeriods,
      futurePeriods,
      pricing: priceRange[0] || { minPrice: 0, maxPrice: 0, avgPrice: 0 }
    };
    
    console.log('✅ Estatísticas geradas:', stats);
    
    res.json({
      success: true,
      data: stats,
      message: 'Estatísticas dos períodos',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao gerar estatísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao gerar estatísticas',
      error: error.message
    });
  }
});

module.exports = router;
