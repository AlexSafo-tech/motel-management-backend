// routes/rooms.js - ROTAS CORRIGIDAS USANDO MODELO SEPARADO
const express = require('express');
const router = express.Router();
const Room = require('../models/Room'); // ✅ IMPORTAR MODELO DO ARQUIVO CORRETO
const auth = require('../middleware/auth');

// ✅ ROTA GET - LISTAR TODOS OS QUARTOS
router.get('/', auth, async (req, res) => {
  try {
    console.log('📥 GET /api/rooms - Listando quartos...');
    
    const rooms = await Room.find().sort({ number: 1 });
    
    console.log(`✅ ${rooms.length} quartos encontrados`);
    
    // ✅ CALCULAR ESTATÍSTICAS
    const stats = {
      total: rooms.length,
      available: rooms.filter(r => r.status === 'available').length,
      occupied: rooms.filter(r => r.status === 'occupied').length,
      maintenance: rooms.filter(r => r.status === 'maintenance').length,
      cleaning: rooms.filter(r => r.status === 'cleaning').length
    };
    
    res.json({
      success: true,
      message: `${rooms.length} quartos encontrados`,
      data: {
        rooms: rooms,
        stats: stats
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao listar quartos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao listar quartos',
      error: error.message
    });
  }
});

// ✅ ROTA GET - OBTER QUARTO POR ID
router.get('/:id', auth, async (req, res) => {
  try {
    console.log(`📥 GET /api/rooms/${req.params.id}`);
    
    const room = await Room.findById(req.params.id);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Quarto não encontrado'
      });
    }
    
    res.json({
      success: true,
      message: 'Quarto encontrado',
      data: room
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar quarto:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar quarto',
      error: error.message
    });
  }
});

// ✅ ROTA POST - CRIAR NOVO QUARTO
router.post('/', auth, async (req, res) => {
  try {
    console.log('📤 POST /api/rooms - Criando novo quarto...');
    console.log('📦 Dados recebidos:', req.body);
    
    const {
      number,
      type = 'standard',
      status = 'available',
      capacity = 2,
      floor,
      prices,
      periods,
      price,
      description = '',
      amenities = []
    } = req.body;
    
    // ✅ VALIDAÇÕES
    if (!number) {
      return res.status(400).json({
        success: false,
        message: 'Número do quarto é obrigatório'
      });
    }
    
    // ✅ VERIFICAR SE JÁ EXISTE
    const existingRoom = await Room.findOne({ number });
    if (existingRoom) {
      return res.status(400).json({
        success: false,
        message: `Quarto ${number} já existe`
      });
    }
    
    // ✅ PREPARAR DADOS
    const roomData = {
      number: number.toString().trim(),
      type,
      status,
      capacity: parseInt(capacity) || 2,
      floor: floor || number.toString().charAt(0) || '1',
      description: description || `Quarto ${number} - ${type}`,
      amenities,
      createdBy: req.user._id
    };
    
    // ✅ CONFIGURAR PREÇOS
    if (prices && typeof prices === 'object') {
      roomData.prices = prices;
    } else if (periods && Array.isArray(periods)) {
      // Converter períodos em preços
      const pricesObj = {};
      periods.forEach(period => {
        if (period.id && period.preco) {
          pricesObj[period.id] = parseFloat(period.preco);
        }
      });
      roomData.prices = pricesObj;
    } else if (price) {
      // Usar preço único para todos os períodos
      const basePrice = parseFloat(price) || 50.00;
      roomData.prices = {
        '4h': basePrice,
        '6h': basePrice * 1.4,
        '12h': basePrice * 2,
        'daily': basePrice * 3
      };
    }
    
    console.log('💾 Dados para salvar:', roomData);
    
    // ✅ CRIAR E SALVAR
    const room = new Room(roomData);
    const savedRoom = await room.save();
    
    console.log('✅ Quarto criado com sucesso:', savedRoom._id);
    
    res.status(201).json({
      success: true,
      message: `Quarto ${number} criado com sucesso`,
      data: savedRoom
    });
    
  } catch (error) {
    console.error('❌ Erro ao criar quarto:', error);
    
    if (error.code === 11000) {
      res.status(400).json({
        success: false,
        message: 'Quarto com este número já existe'
      });
    } else if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Erro ao criar quarto',
        error: error.message
      });
    }
  }
});

// ✅ ROTA PUT - ATUALIZAR QUARTO COMPLETO
router.put('/:id', auth, async (req, res) => {
  try {
    console.log(`📤 PUT /api/rooms/${req.params.id}`);
    console.log('📦 Dados para atualizar:', req.body);
    
    const room = await Room.findByIdAndUpdate(
      req.params.id,
      { 
        ...req.body,
        updatedBy: req.user._id,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    );
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Quarto não encontrado'
      });
    }
    
    console.log('✅ Quarto atualizado:', room.number);
    
    res.json({
      success: true,
      message: 'Quarto atualizado com sucesso',
      data: room
    });
    
  } catch (error) {
    console.error('❌ Erro ao atualizar quarto:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar quarto',
      error: error.message
    });
  }
});

// ✅ ROTA PATCH - ATUALIZAR PARCIALMENTE
router.patch('/:id', auth, async (req, res) => {
  try {
    console.log(`🔄 PATCH /api/rooms/${req.params.id}`);
    console.log('📦 Campos para atualizar:', Object.keys(req.body));
    
    const updateData = {
      ...req.body,
      updatedBy: req.user._id,
      updatedAt: new Date()
    };
    
    // ✅ SE MUDAR STATUS PARA NÃO-MANUTENÇÃO, LIMPAR MOTIVO
    if (req.body.status && req.body.status !== 'maintenance') {
      updateData.$unset = { maintenanceReason: 1 };
    }
    
    const room = await Room.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Quarto não encontrado'
      });
    }
    
    console.log('✅ Quarto atualizado parcialmente:', room.number);
    
    res.json({
      success: true,
      message: 'Quarto atualizado com sucesso',
      data: room
    });
    
  } catch (error) {
    console.error('❌ Erro ao atualizar quarto:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar quarto',
      error: error.message
    });
  }
});

// ✅ ROTA DELETE - DELETAR QUARTO
router.delete('/:id', auth, async (req, res) => {
  try {
    console.log(`🗑️ DELETE /api/rooms/${req.params.id}`);
    
    // ✅ VERIFICAR SE É ADMIN
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Apenas administradores podem deletar quartos'
      });
    }
    
    const room = await Room.findByIdAndDelete(req.params.id);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Quarto não encontrado'
      });
    }
    
    console.log('✅ Quarto deletado:', room.number);
    
    res.json({
      success: true,
      message: `Quarto ${room.number} deletado com sucesso`,
      data: { deletedRoom: room }
    });
    
  } catch (error) {
    console.error('❌ Erro ao deletar quarto:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao deletar quarto',
      error: error.message
    });
  }
});

// ✅ ROTA PATCH - ATUALIZAR STATUS (ESPECÍFICA)
router.patch('/:id/status', auth, async (req, res) => {
  try {
    console.log(`🔄 PATCH /api/rooms/${req.params.id}/status`);
    
    const { status, maintenanceReason } = req.body;
    
    // ✅ VALIDAR STATUS
    const validStatuses = ['available', 'occupied', 'maintenance', 'cleaning'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status inválido. Use: ' + validStatuses.join(', ')
      });
    }
    
    const updateData = { 
      status,
      updatedBy: req.user._id,
      updatedAt: new Date()
    };
    
    // ✅ ADICIONAR OU REMOVER MOTIVO DE MANUTENÇÃO
    if (status === 'maintenance' && maintenanceReason) {
      updateData.maintenanceReason = maintenanceReason;
    } else if (status !== 'maintenance') {
      updateData.$unset = { maintenanceReason: 1 };
    }
    
    const room = await Room.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Quarto não encontrado'
      });
    }
    
    console.log(`✅ Status do quarto ${room.number} alterado para: ${status}`);
    
    res.json({
      success: true,
      message: `Status alterado para: ${status}`,
      data: room
    });
    
  } catch (error) {
    console.error('❌ Erro ao alterar status:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao alterar status',
      error: error.message
    });
  }
});

// ✅ ROTA GET - ESTATÍSTICAS
router.get('/stats/summary', auth, async (req, res) => {
  try {
    console.log('📊 GET /api/rooms/stats/summary');
    
    const stats = await Room.getStats();
    
    res.json({
      success: true,
      message: 'Estatísticas dos quartos',
      data: stats
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

// ✅ ROTA GET - QUARTOS DISPONÍVEIS
router.get('/status/available', auth, async (req, res) => {
  try {
    console.log('🏨 GET /api/rooms/status/available');
    
    const availableRooms = await Room.findAvailable();
    
    res.json({
      success: true,
      message: `${availableRooms.length} quartos disponíveis`,
      data: availableRooms
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar quartos disponíveis:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar quartos disponíveis',
      error: error.message
    });
  }
});

module.exports = router;
