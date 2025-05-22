// routes/customers.js - Rotas de gerenciamento de clientes

const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const Reservation = require('../models/Reservation');
const { authenticate, authorize, checkPermission } = require('../middleware/auth');
const { validateCustomer, sanitizeInput } = require('../middleware/validation');

// @route   GET /api/customers
// @desc    Listar todos os clientes
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      isVip,
      loyaltyLevel,
      isActive = true 
    } = req.query;
    
    // Construir filtros
    const filters = {};
    
    if (isActive !== undefined) filters.isActive = isActive === 'true';
    if (isVip !== undefined) filters.isVip = isVip === 'true';
    if (loyaltyLevel) filters['loyalty.level'] = loyaltyLevel;
    
    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { document: { $regex: search, $options: 'i' } }
      ];
    }

    // Executar consulta com paginação
    const customers = await Customer.find(filters)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Customer.countDocuments(filters);

    // Adicionar estatísticas recentes para cada cliente
    const customersWithStats = await Promise.all(customers.map(async (customer) => {
      const recentReservations = await Reservation.countDocuments({
        customerId: customer._id,
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // últimos 30 dias
      });

      return {
        ...customer.toObject(),
        recentReservations,
        fullAddress: customer.fullAddress,
        age: customer.age
      };
    }));

    res.json({
      success: true,
      data: {
        customers: customersWithStats,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Erro ao listar clientes:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/customers/search
// @desc    Buscar clientes por telefone ou documento
// @access  Private
router.get('/search', authenticate, async (req, res) => {
  try {
    const { phone, document, email } = req.query;

    if (!phone && !document && !email) {
      return res.status(400).json({
        success: false,
        message: 'Forneça pelo menos um critério de busca: phone, document ou email'
      });
    }

    const searchCriteria = [];
    
    if (phone) {
      // Remove formatação do telefone para busca
      const cleanPhone = phone.replace(/[^\d]/g, '');
      searchCriteria.push({ phone: { $regex: cleanPhone, $options: 'i' } });
    }
    
    if (document) {
      const cleanDocument = document.replace(/[^\d]/g, '');
      searchCriteria.push({ document: { $regex: cleanDocument, $options: 'i' } });
    }
    
    if (email) {
      searchCriteria.push({ email: email.toLowerCase() });
    }

    const customer = await Customer.findOne({
      $or: searchCriteria,
      isActive: true
    });

    if (!customer) {
      return res.json({
        success: true,
        data: { customer: null },
        message: 'Cliente não encontrado'
      });
    }

    // Buscar estatísticas do cliente
    const totalReservations = await Reservation.countDocuments({
      customerId: customer._id
    });

    const recentReservations = await Reservation.find({
      customerId: customer._id
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate('roomId', 'number type');

    res.json({
      success: true,
      data: {
        customer: {
          ...customer.toObject(),
          fullAddress: customer.fullAddress,
          age: customer.age,
          totalReservations,
          recentReservations
        }
      }
    });
  } catch (error) {
    console.error('Erro ao buscar cliente:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/customers/:id
// @desc    Obter detalhes de um cliente específico
// @access  Private
router.get('/:id', authenticate, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado'
      });
    }

    // Buscar histórico de reservas
    const reservations = await Reservation.find({
      customerId: customer._id
    })
    .populate('roomId', 'number type category')
    .sort({ createdAt: -1 })
    .limit(20);

    // Calcular estatísticas
    const stats = {
      totalReservations: await Reservation.countDocuments({ customerId: customer._id }),
      totalSpent: reservations.reduce((sum, res) => sum + (res.pricing?.totalPrice || 0), 0),
      averageStay: customer.stats.averageStay,
      favoriteRoomType: null
    };

    // Encontrar tipo de quarto favorito
    const roomTypeStats = {};
    reservations.forEach(res => {
      if (res.roomId?.type) {
        roomTypeStats[res.roomId.type] = (roomTypeStats[res.roomId.type] || 0) + 1;
      }
    });
    
    if (Object.keys(roomTypeStats).length > 0) {
      stats.favoriteRoomType = Object.keys(roomTypeStats).reduce((a, b) => 
        roomTypeStats[a] > roomTypeStats[b] ? a : b
      );
    }

    res.json({
      success: true,
      data: {
        customer: {
          ...customer.toObject(),
          fullAddress: customer.fullAddress,
          age: customer.age
        },
        reservations,
        stats
      }
    });
  } catch (error) {
    console.error('Erro ao obter detalhes do cliente:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   POST /api/customers
// @desc    Criar novo cliente
// @access  Private
router.post('/', authenticate, sanitizeInput, validateCustomer, async (req, res) => {
  try {
    // Verificar se cliente já existe (por telefone ou documento)
    const existingCustomer = await Customer.findOne({
      $or: [
        { phone: req.body.phone },
        { document: req.body.document },
        { email: req.body.email }
      ].filter(condition => Object.values(condition)[0]) // Remove campos vazios
    });

    if (existingCustomer) {
      return res.status(400).json({
        success: false,
        message: 'Cliente já existe com este telefone, documento ou email'
      });
    }

    const customer = new Customer(req.body);
    await customer.save();

    res.status(201).json({
      success: true,
      message: 'Cliente criado com sucesso',
      data: { 
        customer: {
          ...customer.toObject(),
          fullAddress: customer.fullAddress,
          age: customer.age
        }
      }
    });
  } catch (error) {
    console.error('Erro ao criar cliente:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   PUT /api/customers/:id
// @desc    Atualizar cliente
// @access  Private
router.put('/:id', authenticate, sanitizeInput, validateCustomer, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado'
      });
    }

    // Verificar se novo telefone/documento/email não conflita com outro cliente
    if (req.body.phone || req.body.document || req.body.email) {
      const conflictConditions = [];
      
      if (req.body.phone && req.body.phone !== customer.phone) {
        conflictConditions.push({ phone: req.body.phone });
      }
      if (req.body.document && req.body.document !== customer.document) {
        conflictConditions.push({ document: req.body.document });
      }
      if (req.body.email && req.body.email !== customer.email) {
        conflictConditions.push({ email: req.body.email });
      }

      if (conflictConditions.length > 0) {
        const existingCustomer = await Customer.findOne({
          $or: conflictConditions,
          _id: { $ne: customer._id }
        });

        if (existingCustomer) {
          return res.status(400).json({
            success: false,
            message: 'Já existe outro cliente com este telefone, documento ou email'
          });
        }
      }
    }

    // Atualizar campos
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        customer[key] = req.body[key];
      }
    });

    await customer.save();

    res.json({
      success: true,
      message: 'Cliente atualizado com sucesso',
      data: { 
        customer: {
          ...customer.toObject(),
          fullAddress: customer.fullAddress,
          age: customer.age
        }
      }
    });
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   PATCH /api/customers/:id/loyalty
// @desc    Atualizar pontos de fidelidade do cliente
// @access  Private
router.patch('/:id/loyalty', authenticate, async (req, res) => {
  try {
    const { points, operation = 'add' } = req.body;

    if (!points || points <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantidade de pontos deve ser maior que zero'
      });
    }

    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado'
      });
    }

    const oldPoints = customer.loyalty.points;
    const oldLevel = customer.loyalty.level;

    if (operation === 'add') {
      customer.loyalty.points += points;
    } else if (operation === 'subtract') {
      customer.loyalty.points = Math.max(0, customer.loyalty.points - points);
    } else if (operation === 'set') {
      customer.loyalty.points = points;
    }

    // Recalcular nível baseado nos pontos
    if (customer.loyalty.points >= 1000) {
      customer.loyalty.level = 'Platina';
      customer.loyalty.discountPercentage = 15;
    } else if (customer.loyalty.points >= 500) {
      customer.loyalty.level = 'Ouro';
      customer.loyalty.discountPercentage = 10;
    } else if (customer.loyalty.points >= 200) {
      customer.loyalty.level = 'Prata';
      customer.loyalty.discountPercentage = 5;
    } else {
      customer.loyalty.level = 'Bronze';
      customer.loyalty.discountPercentage = 0;
    }

    await customer.save();

    res.json({
      success: true,
      message: 'Pontos de fidelidade atualizados com sucesso',
      data: {
        customer,
        changes: {
          pointsChange: customer.loyalty.points - oldPoints,
          levelChange: oldLevel !== customer.loyalty.level ? {
            from: oldLevel,
            to: customer.loyalty.level
          } : null
        }
      }
    });
  } catch (error) {
    console.error('Erro ao atualizar pontos de fidelidade:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   PATCH /api/customers/:id/vip
// @desc    Alterar status VIP do cliente
// @access  Private (Manager/Admin)
router.patch('/:id/vip', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { isVip } = req.body;

    if (typeof isVip !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Status VIP deve ser true ou false'
      });
    }

    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado'
      });
    }

    customer.isVip = isVip;
    await customer.save();

    res.json({
      success: true,
      message: `Cliente ${isVip ? 'promovido a' : 'removido do status'} VIP`,
      data: { customer }
    });
  } catch (error) {
    console.error('Erro ao alterar status VIP:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   DELETE /api/customers/:id
// @desc    Desativar cliente
// @access  Private (Admin/Manager)
router.delete('/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado'
      });
    }

    // Verificar se há reservas futuras
    const futureReservations = await Reservation.find({
      customerId: customer._id,
      status: { $in: ['confirmed', 'checked-in'] },
      checkOut: { $gt: new Date() }
    });

    if (futureReservations.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Não é possível desativar. Cliente possui reservas futuras.',
        futureReservations: futureReservations.length
      });
    }

    customer.isActive = false;
    await customer.save();

    res.json({
      success: true,
      message: 'Cliente desativado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao desativar cliente:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/customers/stats/overview
// @desc    Obter estatísticas gerais dos clientes
// @access  Private
router.get('/stats/overview', authenticate, async (req, res) => {
  try {
    // Contar clientes por status
    const totalCustomers = await Customer.countDocuments({ isActive: true });
    const vipCustomers = await Customer.countDocuments({ isActive: true, isVip: true });
    
    // Contar por nível de fidelidade
    const loyaltyStats = await Customer.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$loyalty.level', count: { $sum: 1 } } }
    ]);

    // Novos clientes no último mês
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    const newCustomersThisMonth = await Customer.countDocuments({
      isActive: true,
      createdAt: { $gte: lastMonth }
    });

    // Top 10 clientes por gastos
    const topCustomers = await Customer.find({ isActive: true })
      .sort({ 'stats.totalSpent': -1 })
      .limit(10)
      .select('name stats.totalSpent stats.totalVisits loyalty.level');

    res.json({
      success: true,
      data: {
        overview: {
          total: totalCustomers,
          vip: vipCustomers,
          newThisMonth: newCustomersThisMonth,
          regularCustomers: totalCustomers - vipCustomers
        },
        loyaltyDistribution: loyaltyStats,
        topCustomers
      }
    });
  } catch (error) {
    console.error('Erro ao obter estatísticas dos clientes:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;