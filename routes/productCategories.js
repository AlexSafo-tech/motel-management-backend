const express = require('express');
const router = express.Router();
const ProductCategory = require('../models/ProductCategory');
const auth = require('../middleware/auth');

// @route   GET /api/productcategories
// @desc    Listar todas as categorias de produtos
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    // ✅ USAR MÉTODO ESTÁTICO PARA BUSCAR ORDENADAS
    const categories = await ProductCategory.findAllOrdered()
      .limit(limit)
      .skip(skip);

    const total = await ProductCategory.countDocuments({ isActive: true });

    res.json({
      success: true,
      data: categories,
      pagination: {
        current: page,
        limit: limit,
        pages: Math.ceil(total / limit),
        total: total
      }
    });
  } catch (error) {
    console.error('Erro ao buscar categorias:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ ROTA REORDER MOVIDA PARA ANTES DAS ROTAS COM PARÂMETROS (CORRIGIDO)
// @route   PUT /api/productcategories/reorder
// @desc    Reordenar categorias
// @access  Private
router.put('/reorder', auth, async (req, res) => {
  try {
    const { orderedIds } = req.body;

    // ✅ VALIDAÇÕES MELHORADAS
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({
        success: false,
        message: 'orderedIds deve ser um array'
      });
    }

    if (orderedIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'orderedIds não pode estar vazio'
      });
    }

    // ✅ VALIDAR SE TODOS OS IDS SÃO VÁLIDOS
    const validObjectIds = orderedIds.every(id => 
      id && typeof id === 'string' && id.match(/^[0-9a-fA-F]{24}$/)
    );

    if (!validObjectIds) {
      return res.status(400).json({
        success: false,
        message: 'Todos os IDs devem ser ObjectIds válidos'
      });
    }

    console.log('🔄 [REORDER] Reordenando categorias:', orderedIds);

    // ✅ VERIFICAR SE TODAS AS CATEGORIAS EXISTEM
    const existingCategories = await ProductCategory.find({
      _id: { $in: orderedIds },
      isActive: true
    });

    if (existingCategories.length !== orderedIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Algumas categorias não foram encontradas ou estão inativas'
      });
    }

    // ✅ USAR MÉTODO ESTÁTICO PARA REORDENAR
    const updatedCategories = await ProductCategory.reorderCategories(orderedIds);

    console.log('✅ [REORDER] Categorias reordenadas com sucesso');

    res.json({
      success: true,
      data: updatedCategories,
      message: 'Ordem das categorias atualizada com sucesso'
    });

  } catch (error) {
    console.error('❌ [REORDER] Erro ao reordenar categorias:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/productcategories
// @desc    Criar nova categoria
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, icon } = req.body;

    // ✅ VALIDAÇÕES MELHORADAS
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Nome da categoria é obrigatório'
      });
    }

    // Verificar se categoria já existe
    const existingCategory = await ProductCategory.findOne({ 
      name: name.toLowerCase().trim()
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'Categoria já existe'
      });
    }

    // ✅ DEFINIR ORDER AUTOMATICAMENTE COMO ÚLTIMO
    const lastCategory = await ProductCategory.findOne(
      { isActive: true }, 
      {}, 
      { sort: { order: -1 } }
    );
    const nextOrder = lastCategory ? lastCategory.order + 1 : 0;

    const category = new ProductCategory({
      name: name.toLowerCase().trim(),
      description: description?.trim() || '',
      icon: icon || '📦',
      order: nextOrder,      // ✅ ORDEM AUTOMÁTICA
      isActive: true
    });

    await category.save();

    res.status(201).json({
      success: true,
      data: category,
      message: 'Categoria criada com sucesso'
    });
  } catch (error) {
    console.error('Erro ao criar categoria:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/productcategories/:id
// @desc    Buscar categoria por ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const category = await ProductCategory.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Categoria não encontrada'
      });
    }

    res.json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error('Erro ao buscar categoria:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   PUT /api/productcategories/:id
// @desc    Atualizar categoria
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, description, icon, isActive, order } = req.body;

    const category = await ProductCategory.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Categoria não encontrada'
      });
    }

    // Verificar se novo nome já existe (se foi alterado)
    if (name && name.toLowerCase().trim() !== category.name) {
      const existingCategory = await ProductCategory.findOne({ 
        name: name.toLowerCase().trim(),
        _id: { $ne: req.params.id }
      });

      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: 'Nome da categoria já existe'
        });
      }
    }

    // ✅ ATUALIZAR CAMPOS INCLUINDO ORDER
    if (name) category.name = name.toLowerCase().trim();
    if (description !== undefined) category.description = description.trim();
    if (icon) category.icon = icon;
    if (isActive !== undefined) category.isActive = isActive;
    if (order !== undefined) category.order = order;  // ✅ PERMITIR ATUALIZAR ORDEM
    category.updatedAt = new Date();

    await category.save();

    res.json({
      success: true,
      data: category,
      message: 'Categoria atualizada com sucesso'
    });
  } catch (error) {
    console.error('Erro ao atualizar categoria:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   DELETE /api/productcategories/:id
// @desc    Deletar categoria
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const category = await ProductCategory.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Categoria não encontrada'
      });
    }

    // ✅ VERIFICAR SE HÁ PRODUTOS USANDO ESTA CATEGORIA
    const Product = require('../models/Product');
    const productsUsingCategory = await Product.countDocuments({ 
      categoria: req.params.id 
    });

    if (productsUsingCategory > 0) {
      return res.status(400).json({
        success: false,
        message: `Não é possível deletar. ${productsUsingCategory} produtos estão usando esta categoria.`
      });
    }

    await ProductCategory.findByIdAndDelete(req.params.id);

    // ✅ REORGANIZAR ORDENS APÓS DELETAR
    const remainingCategories = await ProductCategory.find({ isActive: true })
      .sort({ order: 1 });
    
    const reorderPromises = remainingCategories.map((cat, index) => 
      ProductCategory.findByIdAndUpdate(cat._id, { order: index })
    );
    
    await Promise.all(reorderPromises);

    res.json({
      success: true,
      message: 'Categoria deletada com sucesso'
    });
  } catch (error) {
    console.error('Erro ao deletar categoria:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;
