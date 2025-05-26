// backend/routes/rooms.js - VERSÃO MELHORADA PARA MOTEL
const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const auth = require('../middleware/auth');

// ✅ CRIAR QUARTO - VERSÃO FLEXÍVEL
router.post('/', auth, async (req, res) => {
  try {
    console.log('📦 Dados recebidos para criar quarto:', req.body);

    const {
      number,
      type,
      status,
      capacity,
      price,
      prices,
      floor,
      description,
      amenities
    } = req.body;

    // ✅ VALIDAÇÕES FLEXÍVEIS
    if (!number) {
      return res.status(400).json({
        success: false,
        message: 'Número do quarto é obrigatório',
        errors: ['Número do quarto não pode estar vazio']
      });
    }

    // ✅ VERIFICAR SE QUARTO JÁ EXISTE
    const existingRoom = await Room.findOne({ number });
    if (existingRoom) {
      return res.status(400).json({
        success: false,
        message: 'Quarto já existe',
        errors: [`Quarto ${number} já está cadastrado`]
      });
    }

    // ✅ TIPOS VÁLIDOS (ACEITA MAIÚSCULO E MINÚSCULO)
    const validTypes = ['standard', 'premium', 'suite', 'luxo', 'Standard', 'Premium', 'Suite', 'Luxo'];
    const roomType = type || 'standard';
    
    if (!validTypes.includes(roomType)) {
      return res.status(400).json({
        success: false,
        message: 'Tipo inválido',
        errors: [`Tipo deve ser: standard, premium, suite ou luxo`]
      });
    }

    // ✅ STATUS VÁLIDOS
    const validStatus = ['available', 'occupied', 'maintenance', 'cleaning'];
    const roomStatus = status || 'available';
    
    if (!validStatus.includes(roomStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Status inválido',
        errors: [`Status deve ser: available, occupied, maintenance ou cleaning`]
      });
    }

    // ✅ DETERMINAR ANDAR AUTOMATICAMENTE
    const autoFloor = number.charAt(0); // 1º dígito do número

    // ✅ PREÇOS FLEXÍVEIS - ACEITA PRICE OU PRICES
    let roomPrices = {};
    if (prices && typeof prices === 'object') {
      // Se veio objeto prices completo
      roomPrices = {
        '4h': prices['4h'] || prices.fourHours || 50.00,
        '6h': prices['6h'] || prices.sixHours || 70.00,
        '12h': prices['12h'] || prices.twelveHours || 100.00,
        'daily': prices.daily || prices.diaria || 150.00
      };
    } else if (price) {
      // Se veio apenas price simples, calcular outros baseado nele
      const basePrice = parseFloat(price);
      roomPrices = {
        '4h': basePrice,
        '6h': basePrice * 1.4, // 40% mais caro
        '12h': basePrice * 2,   // 2x mais caro  
        'daily': basePrice * 3  // 3x mais caro
      };
    } else {
      // Preços padrão
      roomPrices = {
        '4h': 50.00,
        '6h': 70.00,
        '12h': 100.00,
        'daily': 150.00
      };
    }

    // ✅ CRIAR OBJETO DO QUARTO
    const roomData = {
      number: number.toString(),
      type: roomType.toLowerCase(), // Sempre salvar em minúsculo
      status: roomStatus,
      capacity: parseInt(capacity) || 2,
      floor: floor || autoFloor,
      prices: roomPrices,
      description: description || `Quarto ${number} - ${roomType}`,
      amenities: amenities || ['wifi', 'ar_condicionado', 'tv'],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log('💾 Dados formatados para salvar:', roomData);

    // ✅ SALVAR NO BANCO
    const room = new Room(roomData);
    await room.save();

    console.log('✅ Quarto criado com sucesso:', room._id);

    res.status(201).json({
      success: true,
      message: `Quarto ${number} criado com sucesso`,
      data: {
        id: room._id,
        number: room.number,
        type: room.type,
        status: room.status,
        capacity: room.capacity,
        floor: room.floor,
        prices: room.prices,
        description: room.description,
        amenities: room.amenities
      }
    });

  } catch (error) {
    console.error('❌ Erro ao criar quarto:', error);
    
    // ✅ TRATAMENTO ESPECÍFICO DE ERROS
    if (error.code === 11000) {
      // Erro de duplicação
      return res.status(400).json({
        success: false,
        message: 'Quarto já existe',
        errors: ['Número do quarto já está em uso']
      });
    }

    if (error.name === 'ValidationError') {
      // Erros de validação do Mongoose
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      errors: ['Erro ao processar solicitação']
    });
  }
});

// ✅ LISTAR QUARTOS COM FILTROS
router.get('/', auth, async (req, res) => {
  try {
    const { floor, type, status, available } = req.query;
    
    // ✅ CONSTRUIR FILTROS DINAMICAMENTE
    let filter = {};
    
    if (floor) filter.floor = floor;
    if (type) filter.type = type.toLowerCase();
    if (status) filter.status = status;
    if (available === 'true') filter.status = 'available';

    console.log('🔍 Filtros aplicados:', filter);

    const rooms = await Room.find(filter).sort({ number: 1 });

    // ✅ ESTATÍSTICAS ÚTEIS
    const stats = {
      total: rooms.length,
      byFloor: {
        '1': rooms.filter(r => r.floor === '1').length,
        '2': rooms.filter(r => r.floor === '2').length,
        '3': rooms.filter(r => r.floor === '3').length
      },
      byStatus: {
        available: rooms.filter(r => r.status === 'available').length,
        occupied: rooms.filter(r => r.status === 'occupied').length,
        maintenance: rooms.filter(r => r.status === 'maintenance').length,
        cleaning: rooms.filter(r => r.status === 'cleaning').length
      },
      byType: {
        standard: rooms.filter(r => r.type === 'standard').length,
        premium: rooms.filter(r => r.type === 'premium').length,
        suite: rooms.filter(r => r.type === 'suite').length,
        luxo: rooms.filter(r => r.type === 'luxo').length
      }
    };

    res.json({
      success: true,
      message: `${rooms.length} quartos encontrados`,
      data: {
        rooms: rooms,
        stats: stats,
        pagination: {
          current: 1,
          limit: rooms.length,
          total: rooms.length,
          pages: 1
        }
      }
    });

  } catch (error) {
    console.error('❌ Erro ao listar quartos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar quartos',
      errors: ['Erro interno do servidor']
    });
  }
});

// ✅ BUSCAR QUARTO POR ID
router.get('/:id', auth, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Quarto não encontrado'
      });
    }

    res.json({
      success: true,
      data: room
    });

  } catch (error) {
    console.error('❌ Erro ao buscar quarto:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar quarto'
    });
  }
});

// ✅ ATUALIZAR QUARTO
router.put('/:id', auth, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Quarto não encontrado'
      });
    }

    // ✅ ATUALIZAR CAMPOS PERMITIDOS
    const allowedUpdates = ['type', 'status', 'capacity', 'prices', 'description', 'amenities'];
    const updates = {};
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    updates.updatedAt = new Date();

    const updatedRoom = await Room.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Quarto atualizado com sucesso',
      data: updatedRoom
    });

  } catch (error) {
    console.error('❌ Erro ao atualizar quarto:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar quarto'
    });
  }
});

// ✅ DELETAR QUARTO
router.delete('/:id', auth, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Quarto não encontrado'
      });
    }

    await Room.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: `Quarto ${room.number} deletado com sucesso`
    });

  } catch (error) {
    console.error('❌ Erro ao deletar quarto:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao deletar quarto'
    });
  }
});

// ✅ CRIAR MÚLTIPLOS QUARTOS EM MASSA
router.post('/bulk', auth, async (req, res) => {
  try {
    const { rooms } = req.body;
    
    if (!rooms || !Array.isArray(rooms)) {
      return res.status(400).json({
        success: false,
        message: 'Lista de quartos é obrigatória',
        errors: ['Envie um array de quartos']
      });
    }

    const results = {
      created: [],
      errors: []
    };

    for (const roomData of rooms) {
      try {
        // ✅ USAR A MESMA LÓGICA DE VALIDAÇÃO
        const room = new Room({
          number: roomData.number,
          type: (roomData.type || 'standard').toLowerCase(),
          status: roomData.status || 'available',
          capacity: parseInt(roomData.capacity) || 2,
          floor: roomData.floor || roomData.number.charAt(0),
          prices: roomData.prices || {
            '4h': 50.00,
            '6h': 70.00,
            '12h': 100.00,
            'daily': 150.00
          },
          description: roomData.description || `Quarto ${roomData.number}`,
          amenities: roomData.amenities || ['wifi', 'ar_condicionado', 'tv']
        });

        await room.save();
        results.created.push(room.number);

      } catch (error) {
        results.errors.push({
          room: roomData.number,
          error: error.message
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `Criação em massa concluída`,
      data: {
        created: results.created.length,
        errors: results.errors.length,
        details: results
      }
    });

  } catch (error) {
    console.error('❌ Erro na criação em massa:', error);
    res.status(500).json({
      success: false,
      message: 'Erro na criação em massa'
    });
  }
});

module.exports = router;
