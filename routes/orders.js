// routes/orders.js - Rotas de gerenciamento de pedidos

const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product').Product;
const Reservation = require('../models/Reservation');
const Customer = require('../models/Customer');
const { authenticate, authorize, checkPermission } = require('../middleware/auth');
const { validateOrder, sanitizeInput } = require('../middleware/validation');

// @route   GET /api/orders
// @desc    Listar todos os pedidos
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status,
      orderType,
      roomNumber,
      customerId,
      dateFrom,
      dateTo,
      search
    } = req.query;
    
    // Construir filtros
    const filters = {};
    
    if (status) filters.status = status;
    if (orderType) filters.orderType = orderType;
    if (roomNumber) filters.roomNumber = roomNumber;
    if (customerId) filters.customerId = customerId;
    
    // Filtros de data
    if (dateFrom || dateTo) {
      filters.createdAt = {};
      if (dateFrom) filters.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filters.createdAt.$lte = new Date(dateTo);
    }
    
    if (search) {
      filters.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { roomNumber: { $regex: search, $options: 'i' } }
      ];
    }

    // Executar consulta com paginação
    const orders = await Order.find(filters)
      .populate('customerId', 'name phone')
      .populate('reservationId', 'reservationNumber')
      .populate('staff.createdBy', 'name')
      .populate('staff.confirmedBy', 'name')
      .populate('staff.preparedBy', 'name')
      .populate('staff.deliveredBy', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments(filters);

    // Adicionar informações calculadas
    const ordersWithCalcs = orders.map(order => ({
      ...order.toObject(),
      preparationTime: order.preparationTime,
      isDelayed: order.isDelayed
    }));

    res.json({
      success: true,
      data: {
        orders: ordersWithCalcs,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Erro ao listar pedidos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/orders/active
// @desc    Listar pedidos ativos (em preparação)
// @access  Private
router.get('/active', authenticate, async (req, res) => {
  try {
    const activeOrders = await Order.find({
      status: { $in: ['pending', 'confirmed', 'preparing', 'ready'] }
    })
    .populate('customerId', 'name phone')
    .populate('reservationId', 'reservationNumber')
    .sort({ 'timeline.orderedAt': 1 });

    // Adicionar informações de tempo
    const ordersWithTime = activeOrders.map(order => ({
      ...order.toObject(),
      preparationTime: order.preparationTime,
      isDelayed: order.isDelayed,
      estimatedReadyAt: order.deliveryInfo.estimatedTime ? 
        new Date(order.timeline.orderedAt.getTime() + (order.deliveryInfo.estimatedTime * 60 * 1000)) : null
    }));

    res.json({
      success: true,
      data: { orders: ordersWithTime }
    });
  } catch (error) {
    console.error('Erro ao listar pedidos ativos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/orders/:id
// @desc    Obter detalhes de um pedido específico
// @access  Private
router.get('/:id', authenticate, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customerId')
      .populate('reservationId')
      .populate('items.productId')
      .populate('staff.createdBy', 'name email')
      .populate('staff.confirmedBy', 'name email')
      .populate('staff.preparedBy', 'name email')
      .populate('staff.deliveredBy', 'name email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Pedido não encontrado'
      });
    }

    res.json({
      success: true,
      data: {
        order: {
          ...order.toObject(),
          preparationTime: order.preparationTime,
          isDelayed: order.isDelayed
        }
      }
    });
  } catch (error) {
    console.error('Erro ao obter detalhes do pedido:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   POST /api/orders
// @desc    Criar novo pedido
// @access  Private
router.post('/', authenticate, sanitizeInput, validateOrder, async (req, res) => {
  try {
    const { reservationId, items, orderType = 'frigobar', deliveryInfo, customerInfo } = req.body;

    // Verificar se reserva existe e está ativa
    const reservation = await Reservation.findById(reservationId)
      .populate('customerId')
      .populate('roomId', 'number');

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reserva não encontrada'
      });
    }

    if (reservation.status !== 'checked-in') {
      return res.status(400).json({
        success: false,
        message: 'Só é possível fazer pedidos para reservas com check-in realizado'
      });
    }

    // Validar e processar itens do pedido
    const processedItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = await Product.findById(item.productId);
      
      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Produto não encontrado: ${item.productId}`
        });
      }

      if (!product.availability.isActive || !product.availability.isVisible) {
        return res.status(400).json({
          success: false,
          message: `Produto não está disponível: ${product.name}`
        });
      }

      if (product.inventory.currentStock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Estoque insuficiente para ${product.name}. Disponível: ${product.inventory.currentStock}`
        });
      }

      const unitPrice = product.pricing.price;
      const totalPrice = unitPrice * item.quantity;

      processedItems.push({
        productId: product._id,
        productName: product.name,
        productSku: product.sku,
        quantity: item.quantity,
        unitPrice,
        totalPrice,
        notes: item.notes || ''
      });

      subtotal += totalPrice;
    }

    // Calcular impostos e taxas
    const serviceCharge = orderType === 'room_service' ? subtotal * 0.1 : 0; // 10% para room service
    const tax = 0; // Implementar lógica de impostos se necessário

    // Criar pedido
    const order = new Order({
      reservationId: reservation._id,
      customerId: reservation.customerId._id,
      roomNumber: reservation.roomId.number,
      items: processedItems,
      pricing: {
        subtotal,
        serviceCharge,
        tax,
        total: subtotal + serviceCharge + tax
      },
      orderType,
      deliveryInfo: {
        location: deliveryInfo?.location || 'room',
        instructions: deliveryInfo?.instructions || '',
        estimatedTime: deliveryInfo?.estimatedTime || (orderType === 'frigobar' ? 5 : 30)
      },
      customerInfo: customerInfo || {},
      staff: {
        createdBy: req.user._id
      }
    });

    await order.save();

    // Atualizar estoque dos produtos
    for (const item of processedItems) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { 'inventory.currentStock': -item.quantity } }
      );
    }

    // Popular dados para retorno
    await order.populate('customerId', 'name phone');
    await order.populate('reservationId', 'reservationNumber');
    await order.populate('staff.createdBy', 'name');

    res.status(201).json({
      success: true,
      message: 'Pedido criado com sucesso',
      data: { order }
    });
  } catch (error) {
    console.error('Erro ao criar pedido:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   PATCH /api/orders/:id/confirm
// @desc    Confirmar pedido
// @access  Private
router.patch('/:id/confirm', authenticate, checkPermission('canManageOrders'), async (req, res) => {
  try {
    const { estimatedTime } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Pedido não encontrado'
      });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Só é possível confirmar pedidos com status "pending"'
      });
    }

    // Confirmar pedido
    await order.confirm(req.user._id);

    // Atualizar tempo estimado se fornecido
    if (estimatedTime) {
      order.deliveryInfo.estimatedTime = estimatedTime;
      await order.save();
    }

    await order.populate('staff.confirmedBy', 'name');

    res.json({
      success: true,
      message: 'Pedido confirmado com sucesso',
      data: { order }
    });
  } catch (error) {
    console.error('Erro ao confirmar pedido:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   PATCH /api/orders/:id/start-preparing
// @desc    Iniciar preparação do pedido
// @access  Private
router.patch('/:id/start-preparing', authenticate, checkPermission('canManageOrders'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Pedido não encontrado'
      });
    }

    if (order.status !== 'confirmed') {
      return res.status(400).json({
        success: false,
        message: 'Só é possível iniciar preparação de pedidos confirmados'
      });
    }

    await order.startPreparing(req.user._id);
    await order.populate('staff.preparedBy', 'name');

    res.json({
      success: true,
      message: 'Preparação do pedido iniciada',
      data: { order }
    });
  } catch (error) {
    console.error('Erro ao iniciar preparação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   PATCH /api/orders/:id/ready
// @desc    Marcar pedido como pronto
// @access  Private
router.patch('/:id/ready', authenticate, checkPermission('canManageOrders'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Pedido não encontrado'
      });
    }

    if (order.status !== 'preparing') {
      return res.status(400).json({
        success: false,
        message: 'Só é possível marcar como pronto pedidos em preparação'
      });
    }

    await order.markReady();

    res.json({
      success: true,
      message: 'Pedido marcado como pronto',
      data: { 
        order,
        preparationTime: order.preparationTime
      }
    });
  } catch (error) {
    console.error('Erro ao marcar pedido como pronto:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   PATCH /api/orders/:id/deliver
// @desc    Marcar pedido como entregue
// @access  Private
router.patch('/:id/deliver', authenticate, checkPermission('canManageOrders'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Pedido não encontrado'
      });
    }

    if (order.status !== 'ready') {
      return res.status(400).json({
        success: false,
        message: 'Só é possível entregar pedidos que estão prontos'
      });
    }

    await order.deliver(req.user._id);

    // Atualizar estatísticas de vendas dos produtos
    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (product) {
        await product.recordSale(item.quantity);
      }
    }

    await order.populate('staff.deliveredBy', 'name');

    res.json({
      success: true,
      message: 'Pedido entregue com sucesso',
      data: { order }
    });
  } catch (error) {
    console.error('Erro ao entregar pedido:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   PATCH /api/orders/:id/cancel
// @desc    Cancelar pedido
// @access  Private
router.patch('/:id/cancel', authenticate, checkPermission('canManageOrders'), async (req, res) => {
  try {
    const { reason = '' } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Pedido não encontrado'
      });
    }

    if (['delivered', 'cancelled'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'Não é possível cancelar pedidos entregues ou já cancelados'
      });
    }

    // Devolver itens ao estoque se ainda não foram preparados
    if (['pending', 'confirmed'].includes(order.status)) {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { 'inventory.currentStock': item.quantity } }
        );
      }
    }

    await order.cancel(reason);

    res.json({
      success: true,
      message: 'Pedido cancelado com sucesso',
      data: { order }
    });
  } catch (error) {
    console.error('Erro ao cancelar pedido:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   PATCH /api/orders/:id/rating
// @desc    Adicionar avaliação ao pedido
// @access  Private
router.patch('/:id/rating', authenticate, async (req, res) => {
  try {
    const { score, comment = '' } = req.body;

    if (!score || score < 1 || score > 5) {
      return res.status(400).json({
        success: false,
        message: 'Avaliação deve ser entre 1 e 5'
      });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Pedido não encontrado'
      });
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Só é possível avaliar pedidos entregues'
      });
    }

    if (order.rating.score) {
      return res.status(400).json({
        success: false,
        message: 'Este pedido já foi avaliado'
      });
    }

    await order.addRating(score, comment);

    res.json({
      success: true,
      message: 'Avaliação adicionada com sucesso',
      data: { order }
    });
  } catch (error) {
    console.error('Erro ao adicionar avaliação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/orders/room/:roomNumber
// @desc    Listar pedidos de um quarto específico
// @access  Private
router.get('/room/:roomNumber', authenticate, async (req, res) => {
  try {
    const { roomNumber } = req.params;
    const { status, dateFrom, dateTo } = req.query;

    const filters = { roomNumber };
    
    if (status) filters.status = status;
    
    if (dateFrom || dateTo) {
      filters.createdAt = {};
      if (dateFrom) filters.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filters.createdAt.$lte = new Date(dateTo);
    }

    const orders = await Order.find(filters)
      .populate('customerId', 'name phone')
      .populate('items.productId', 'name')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      data: { 
        roomNumber,
        orders: orders.map(order => ({
          ...order.toObject(),
          preparationTime: order.preparationTime,
          isDelayed: order.isDelayed
        }))
      }
    });
  } catch (error) {
    console.error('Erro ao listar pedidos do quarto:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/orders/stats/overview
// @desc    Obter estatísticas gerais dos pedidos
// @access  Private
router.get('/stats/overview', authenticate, async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    // Pedidos de hoje
    const todayOrders = await Order.countDocuments({
      'timeline.orderedAt': { $gte: startOfDay, $lte: endOfDay }
    });

    // Pedidos por status
    const statusStats = await Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Receita de pedidos do mês
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthlyRevenue = await Order.aggregate([
      {
        $match: {
          status: 'delivered',
          'timeline.deliveredAt': { $gte: startOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$pricing.total' },
          count: { $sum: 1 },
          averageOrder: { $avg: '$pricing.total' }
        }
      }
    ]);

    // Produtos mais vendidos
    const topProducts = await Order.aggregate([
      { $match: { status: 'delivered' } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          productName: { $first: '$items.productName' },
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.totalPrice' }
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 }
    ]);

    // Tempo médio de preparação
    const avgPreparationTime = await Order.aggregate([
      {
        $match: {
          status: 'delivered',
          'timeline.confirmedAt': { $exists: true },
          'timeline.readyAt': { $exists: true }
        }
      },
      {
        $project: {
          preparationTime: {
            $divide: [
              { $subtract: ['$timeline.readyAt', '$timeline.confirmedAt'] },
              1000 * 60 // converter para minutos
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgTime: { $avg: '$preparationTime' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          todayOrders,
          activeOrders: await Order.countDocuments({ 
            status: { $in: ['pending', 'confirmed', 'preparing', 'ready'] }
          }),
          deliveredToday: await Order.countDocuments({
            status: 'delivered',
            'timeline.deliveredAt': { $gte: startOfDay, $lte: endOfDay }
          })
        },
        statusDistribution: statusStats,
        monthlyRevenue: monthlyRevenue[0] || { total: 0, count: 0, averageOrder: 0 },
        topProducts,
        averagePreparationTime: avgPreparationTime[0]?.avgTime || 0
      }
    });
  } catch (error) {
    console.error('Erro ao obter estatísticas dos pedidos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;