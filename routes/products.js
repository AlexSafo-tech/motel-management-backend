// routes/products.js - Rotas de gerenciamento de produtos

const express = require('express');
const router = express.Router();
const { Product, ProductCategory } = require('../models/Product');
const { authenticate, authorize, checkPermission } = require('../middleware/auth');
const { validateProduct, sanitizeInput } = require('../middleware/validation');

// ================ ROTAS DE CATEGORIAS ================

// @route   GET /api/products/categories
// @desc    Listar todas as categorias
// @access  Private
router.get('/categories', authenticate, async (req, res) => {
  try {
    const { isActive } = req.query;
    
    const filters = {};
    if (isActive !== undefined) filters.isActive = isActive === 'true';

    const categories = await ProductCategory.find(filters)
      .sort({ name: 1 });

    // Contar produtos por categoria
    const categoriesWithCount = await Promise.all(categories.map(async (category) => {
      const productCount = await Product.countDocuments({ 
        category: category._id,
        'availability.isActive': true 
      });
      
      return {
        ...category.toObject(),
        productCount
      };
    }));

    res.json({
      success: true,
      data: { categories: categoriesWithCount }
    });
  } catch (error) {
    console.error('Erro ao listar categorias:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   POST /api/products/categories
// @desc    Criar nova categoria
// @access  Private (Admin/Manager)
router.post('/categories', authenticate, authorize('admin', 'manager'), sanitizeInput, async (req, res) => {
  try {
    const { name, description, icon } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Nome da categoria deve ter pelo menos 2 caracteres'
      });
    }

    // Verificar se categoria já existe
    const existingCategory = await ProductCategory.findOne({ 
      name: name.trim(),
      isActive: true 
    });
    
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'Já existe uma categoria com este nome'
      });
    }

    const category = new ProductCategory({
      name: name.trim(),
      description: description?.trim(),
      icon: icon?.trim()
    });

    await category.save();

    res.status(201).json({
      success: true,
      message: 'Categoria criada com sucesso',
      data: { category }
    });
  } catch (error) {
    console.error('Erro ao criar categoria:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ================ ROTAS DE PRODUTOS ================

// @route   GET /api/products
// @desc    Listar todos os produtos
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      category,
      isActive,
      isVisible,
      lowStock,
      search,
      sortBy = 'name',
      sortOrder = 'asc'
    } = req.query;
    
    // Construir filtros
    const filters = {};
    
    if (category) filters.category = category;
    if (isActive !== undefined) filters['availability.isActive'] = isActive === 'true';
    if (isVisible !== undefined) filters['availability.isVisible'] = isVisible === 'true';
    
    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } }
      ];
    }

    // Construir ordenação
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Executar consulta com paginação
    let query = Product.find(filters)
      .populate('category', 'name icon')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Filtro de estoque baixo (aplicado depois da consulta inicial)
    let products = await query;

    if (lowStock === 'true') {
      products = products.filter(product => product.isLowStock);
    }

    const total = await Product.countDocuments(filters);

    // Adicionar informações calculadas
    const productsWithCalcs = products.map(product => ({
      ...product.toObject(),
      isLowStock: product.isLowStock,
      isOutOfStock: product.isOutOfStock,
      needsReorder: product.needsReorder,
      stockValue: product.getStockValue()
    }));

    res.json({
      success: true,
      data: {
        products: productsWithCalcs,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Erro ao listar produtos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/products/available/:roomNumber
// @desc    Listar produtos disponíveis para um quarto específico
// @access  Private
router.get('/available/:roomNumber', authenticate, async (req, res) => {
  try {
    const { roomNumber } = req.params;
    const { category } = req.query;

    const filters = {
      'availability.isActive': true,
      'availability.isVisible': true,
      'inventory.currentStock': { $gt: 0 }
    };

    if (category) filters.category = category;

    // Filtrar por quarto se especificado no produto
    filters.$or = [
      { 'availability.availableRooms': { $size: 0 } }, // Disponível em todos os quartos
      { 'availability.availableRooms': roomNumber }     // Disponível neste quarto específico
    ];

    const products = await Product.find(filters)
      .populate('category', 'name icon')
      .sort({ name: 1 });

    // Verificar horário de disponibilidade
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM

    const availableProducts = products.filter(product => {
      if (!product.availability.availableHours.start || !product.availability.availableHours.end) {
        return true; // Disponível 24h se não especificado
      }

      const startTime = product.availability.availableHours.start;
      const endTime = product.availability.availableHours.end;

      return currentTime >= startTime && currentTime <= endTime;
    });

    // Agrupar por categoria
    const productsByCategory = {};
    availableProducts.forEach(product => {
      const categoryName = product.category.name;
      if (!productsByCategory[categoryName]) {
        productsByCategory[categoryName] = {
          category: product.category,
          products: []
        };
      }
      productsByCategory[categoryName].products.push({
        ...product.toObject(),
        isLowStock: product.isLowStock,
        stockValue: product.getStockValue()
      });
    });

    res.json({
      success: true,
      data: {
        roomNumber,
        categories: Object.values(productsByCategory),
        totalProducts: availableProducts.length
      }
    });
  } catch (error) {
    console.error('Erro ao listar produtos disponíveis:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/products/:id
// @desc    Obter detalhes de um produto específico
// @access  Private
router.get('/:id', authenticate, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produto não encontrado'
      });
    }

    // Buscar histórico de vendas recentes
    const Order = require('../models/Order');
    const recentSales = await Order.aggregate([
      { $unwind: '$items' },
      { $match: { 'items.productId': product._id } },
      { $sort: { createdAt: -1 } },
      { $limit: 10 },
      {
        $project: {
          orderNumber: 1,
          'items.quantity': 1,
          'items.unitPrice': 1,
          'items.totalPrice': 1,
          createdAt: 1,
          status: 1
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        product: {
          ...product.toObject(),
          isLowStock: product.isLowStock,
          isOutOfStock: product.isOutOfStock,
          needsReorder: product.needsReorder,
          stockValue: product.getStockValue()
        },
        recentSales
      }
    });
  } catch (error) {
    console.error('Erro ao obter detalhes do produto:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   POST /api/products
// @desc    Criar novo produto
// @access  Private (Admin/Manager)
router.post('/', authenticate, authorize('admin', 'manager'), sanitizeInput, validateProduct, async (req, res) => {
  try {
    // Verificar se categoria existe
    const category = await ProductCategory.findById(req.body.category);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Categoria não encontrada'
      });
    }

    // Verificar se SKU já existe (se fornecido)
    if (req.body.sku) {
      const existingProduct = await Product.findOne({ sku: req.body.sku });
      if (existingProduct) {
        return res.status(400).json({
          success: false,
          message: 'Já existe um produto com este SKU'
        });
      }
    }

    // Verificar se código de barras já existe (se fornecido)
    if (req.body.barcode) {
      const existingProduct = await Product.findOne({ barcode: req.body.barcode });
      if (existingProduct) {
        return res.status(400).json({
          success: false,
          message: 'Já existe um produto com este código de barras'
        });
      }
    }

    const product = new Product(req.body);
    await product.save();

    await product.populate('category', 'name icon');

    res.status(201).json({
      success: true,
      message: 'Produto criado com sucesso',
      data: { product }
    });
  } catch (error) {
    console.error('Erro ao criar produto:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   PUT /api/products/:id
// @desc    Atualizar produto
// @access  Private (Admin/Manager)
router.put('/:id', authenticate, authorize('admin', 'manager'), sanitizeInput, validateProduct, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produto não encontrado'
      });
    }

    // Verificar conflitos de SKU e código de barras
    if (req.body.sku && req.body.sku !== product.sku) {
      const existingProduct = await Product.findOne({ 
        sku: req.body.sku,
        _id: { $ne: product._id }
      });
      if (existingProduct) {
        return res.status(400).json({
          success: false,
          message: 'Já existe outro produto com este SKU'
        });
      }
    }

    if (req.body.barcode && req.body.barcode !== product.barcode) {
      const existingProduct = await Product.findOne({ 
        barcode: req.body.barcode,
        _id: { $ne: product._id }
      });
      if (existingProduct) {
        return res.status(400).json({
          success: false,
          message: 'Já existe outro produto com este código de barras'
        });
      }
    }

    // Atualizar campos
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        product[key] = req.body[key];
      }
    });

    await product.save();
    await product.populate('category', 'name icon');

    res.json({
      success: true,
      message: 'Produto atualizado com sucesso',
      data: { product }
    });
  } catch (error) {
    console.error('Erro ao atualizar produto:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   PATCH /api/products/:id/stock
// @desc    Atualizar estoque do produto
// @access  Private
router.patch('/:id/stock', authenticate, checkPermission('canManageInventory'), async (req, res) => {
  try {
    const { quantity, operation = 'set', reason = '' } = req.body;

    if (!quantity || quantity < 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantidade deve ser um número positivo'
      });
    }

    const validOperations = ['add', 'subtract', 'set'];
    if (!validOperations.includes(operation)) {
      return res.status(400).json({
        success: false,
        message: `Operação deve ser uma das seguintes: ${validOperations.join(', ')}`
      });
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produto não encontrado'
      });
    }

    const oldStock = product.inventory.currentStock;
    await product.updateStock(quantity, operation);

    // Log da alteração (em uma implementação real, você salvaria isso em uma tabela de auditoria)
    const stockChange = {
      productId: product._id,
      productName: product.name,
      operation,
      quantity,
      oldStock,
      newStock: product.inventory.currentStock,
      reason,
      changedBy: req.user._id,
      timestamp: new Date()
    };

    res.json({
      success: true,
      message: 'Estoque atualizado com sucesso',
      data: {
        product: {
          ...product.toObject(),
          isLowStock: product.isLowStock,
          isOutOfStock: product.isOutOfStock,
          needsReorder: product.needsReorder
        },
        stockChange
      }
    });
  } catch (error) {
    console.error('Erro ao atualizar estoque:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/products/low-stock/alert
// @desc    Listar produtos com estoque baixo
// @access  Private
router.get('/low-stock/alert', authenticate, checkPermission('canManageInventory'), async (req, res) => {
  try {
    const products = await Product.find({
      'availability.isActive': true
    }).populate('category', 'name');

    // Filtrar produtos com estoque baixo
    const lowStockProducts = products.filter(product => product.isLowStock);
    const outOfStockProducts = products.filter(product => product.isOutOfStock);
    const reorderProducts = products.filter(product => product.needsReorder);

    res.json({
      success: true,
      data: {
        lowStock: lowStockProducts.map(p => ({
          ...p.toObject(),
          isLowStock: p.isLowStock,
          stockValue: p.getStockValue()
        })),
        outOfStock: outOfStockProducts.map(p => ({
          ...p.toObject(),
          isOutOfStock: p.isOutOfStock
        })),
        needsReorder: reorderProducts.map(p => ({
          ...p.toObject(),
          needsReorder: p.needsReorder
        })),
        summary: {
          lowStockCount: lowStockProducts.length,
          outOfStockCount: outOfStockProducts.length,
          needsReorderCount: reorderProducts.length
        }
      }
    });
  } catch (error) {
    console.error('Erro ao obter alertas de estoque:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/products/stats/overview
// @desc    Obter estatísticas gerais dos produtos
// @access  Private
router.get('/stats/overview', authenticate, async (req, res) => {
  try {
    // Contadores básicos
    const totalProducts = await Product.countDocuments({ 'availability.isActive': true });
    const activeProducts = await Product.countDocuments({ 
      'availability.isActive': true, 
      'availability.isVisible': true 
    });

    // Produtos por categoria
    const categoryStats = await Product.aggregate([
      { $match: { 'availability.isActive': true } },
      { 
        $lookup: {
          from: 'productcategories',
          localField: 'category',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      { $unwind: '$categoryInfo' },
      { 
        $group: { 
          _id: '$categoryInfo.name', 
          count: { $sum: 1 },
          totalValue: { $sum: { $multiply: ['$inventory.currentStock', '$pricing.cost'] } }
        }
      }
    ]);

    // Valor total do estoque
    const stockValue = await Product.aggregate([
      { $match: { 'availability.isActive': true } },
      {
        $group: {
          _id: null,
          totalCost: { $sum: { $multiply: ['$inventory.currentStock', '$pricing.cost'] } },
          totalPrice: { $sum: { $multiply: ['$inventory.currentStock', '$pricing.price'] } }
        }
      }
    ]);

    // Produtos mais vendidos (últimos 30 dias)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const topSellingProducts = await Product.find({ 'availability.isActive': true })
      .sort({ 'sales.totalSold': -1 })
      .limit(10)
      .populate('category', 'name')
      .select('name sales.totalSold sales.lastSale pricing.price');

    res.json({
      success: true,
      data: {
        overview: {
          totalProducts,
          activeProducts,
          categories: await ProductCategory.countDocuments({ isActive: true }),
          totalStockValue: stockValue[0]?.totalCost || 0,
          totalRetailValue: stockValue[0]?.totalPrice || 0
        },
        categoryDistribution: categoryStats,
        topSellingProducts
      }
    });
  } catch (error) {
    console.error('Erro ao obter estatísticas dos produtos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route