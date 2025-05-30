// routes/rooms.js - ROTAS COMPLETAS PARA QUARTOS (CORRIGIDO)
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Room = require('../models/Room'); // ✅ IMPORTAR MODELO CORRETO
const { authenticate } = require('../middleware/auth'); // ✅ CORRIGIDO
const auth = authenticate; // adicionar esta linha para compatibilidade

// ✅ ROTA GET - LISTAR TODOS OS QUARTOS
router.get('/', authenticate, async (req, res) => {
  try {
    console.log('📥 GET /api/rooms - Listando quartos...');
    console.log('👤 Usuário:', req.user);
    
    const rooms = await Room.find().sort({ number: 1 });
    
    console.log(`✅ ${rooms.length} quartos encontrados`);
    
    res.json({
      success: true,
      message: `${rooms.length} quartos encontrados`,
      data: {
        rooms: rooms,
        total: rooms.length,
        stats: {
          available: rooms.filter(r => r.status === 'available').length,
          occupied: rooms.filter(r => r.status === 'occupied').length,
          maintenance: rooms.filter(r => r.status === 'maintenance').length,
          cleaning: rooms.filter(r => r.status === 'cleaning').length
        }
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
router.get('/:id', authenticate, async (req, res) => {
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
router.post('/', authenticate, async (req, res) => {
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
      price,
      description = '',
      amenities = [],
      periods
    } = req.body;
    
    // Validações básicas
    if (!number) {
      return res.status(400).json({
        success: false,
        message: 'Número do quarto é obrigatório'
      });
    }
    
    // Verificar se quarto já existe
    const existingRoom = await Room.findOne({ number });
    if (existingRoom) {
      return res.status(400).json({
        success: false,
        message: `Quarto ${number} já existe`
      });
    }
    
    // Preparar dados do quarto
    const roomData = {
      number: number.toString().trim(),
      type,
      status,
      capacity: parseInt(capacity) || 2,
      floor: floor || number.toString().charAt(0) || '1',
      description: description || `Quarto ${number} - ${type}`,
      amenities
    };
    
    // Configurar preços
    if (prices && typeof prices === 'object') {
      roomData.prices = {
        '4h': parseFloat(prices['4h']) || 50.00,
        '6h': parseFloat(prices['6h']) || 70.00,
        '12h': parseFloat(prices['12h']) || 100.00,
        'daily': parseFloat(prices['daily']) || 150.00
      };
      roomData.price = roomData.prices['4h']; // Para compatibilidade
    } else if (price) {
      roomData.price = parseFloat(price) || 50.00;
      roomData.prices = {
        '4h': roomData.price,
        '6h': roomData.price * 1.4,
        '12h': roomData.price * 2,
        'daily': roomData.price * 3
      };
    } else {
      roomData.prices = {
        '4h': 50.00,
        '6h': 70.00,
        '12h': 100.00,
        'daily': 150.00
      };
      roomData.price = 50.00;
    }
    
    console.log('💾 Dados para salvar:', roomData);
    
    // Criar quarto
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

// ✅ ROTA PUT - ATUALIZAR QUARTO
router.put('/:id', authenticate, async (req, res) => {
  try {
    console.log(`📤 PUT /api/rooms/${req.params.id}`);
    console.log('📦 Dados para atualizar:', req.body);
    
    const room = await Room.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Quarto não encontrado'
      });
    }
    
    console.log('✅ Quarto atualizado:', room._id);
    
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
router.delete('/:id', authenticate, async (req, res) => {
  try {
    console.log(`🗑️ DELETE /api/rooms/${req.params.id}`);
    
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

// ✅ ROTA PATCH - ATUALIZAR STATUS OU CAMPOS ESPECÍFICOS
router.patch('/:id', authenticate, async (req, res) => {
  try {
    console.log(`🔄 PATCH /api/rooms/${req.params.id}`);
    console.log('📦 Dados para atualizar:', req.body);
    
    const room = await Room.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Quarto não encontrado'
      });
    }
    
    console.log('✅ Quarto atualizado:', room._id);
    
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

// ✅ ROTA PATCH - ATUALIZAR STATUS DO QUARTO (ESPECÍFICA)
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    console.log(`🔄 PATCH /api/rooms/${req.params.id}/status`);
    console.log('📦 Novo status:', req.body.status);
    
    const { status, maintenanceReason } = req.body;
    
    if (!['available', 'occupied', 'maintenance', 'cleaning'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status inválido'
      });
    }
    
    const updateData = { status };
    
    // Se for manutenção e tiver motivo, adicionar
    if (status === 'maintenance' && maintenanceReason) {
      updateData.maintenanceReason = maintenanceReason;
    }
    
    // Se não for manutenção, remover motivo anterior
    if (status !== 'maintenance') {
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

// ✅ ROTA GET - ESTATÍSTICAS DOS QUARTOS
router.get('/stats/summary', authenticate, async (req, res) => {
  try {
    console.log('📊 GET /api/rooms/stats/summary');
    
    const total = await Room.countDocuments();
    const available = await Room.countDocuments({ status: 'available' });
    const occupied = await Room.countDocuments({ status: 'occupied' });
    const maintenance = await Room.countDocuments({ status: 'maintenance' });
    const cleaning = await Room.countDocuments({ status: 'cleaning' });
    
    const byType = await Room.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);
    
    const byFloor = await Room.aggregate([
      { $group: { _id: '$floor', count: { $sum: 1 } } }
    ]);
    
    res.json({
      success: true,
      message: 'Estatísticas dos quartos',
      data: {
        total,
        status: {
          available,
          occupied,
          maintenance,
          cleaning
        },
        byType: byType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byFloor: byFloor.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        occupancyRate: total > 0 ? ((occupied / total) * 100).toFixed(1) : 0
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

module.exports = router;
