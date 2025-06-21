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

    const categories = await ProductCategory.find({ isActive: true })
      .sort({ name: 1 })
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

// @route   POST /api/productcategories
// @desc    Criar nova categoria
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, icon } = req.body;

    // Verificar se categoria já existe
    const existingCategory = await ProductCategory.findOne({ 
      name: name.toLowerCase() 
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'Categoria já existe'
      });
    }

    const category = new ProductCategory({
      name: name.toLowerCase(),
      description: description || '',
      icon: icon || '📦',
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
    const { name, description, icon, isActive } = req.body;

    const category = await ProductCategory.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Categoria não encontrada'
      });
    }

    // Verificar se novo nome já existe (se foi alterado)
    if (name && name.toLowerCase() !== category.name) {
      const existingCategory = await ProductCategory.findOne({ 
        name: name.toLowerCase(),
        _id: { $ne: req.params.id }
      });

      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: 'Nome da categoria já existe'
        });
      }
    }

    // Atualizar campos
    if (name) category.name = name.toLowerCase();
    if (description !== undefined) category.description = description;
    if (icon) category.icon = icon;
    if (isActive !== undefined) category.isActive = isActive;
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

    // Verificar se há produtos usando esta categoria
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
