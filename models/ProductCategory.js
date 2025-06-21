const mongoose = require('mongoose');

// ✅ VERIFICAR SE O MODELO JÁ EXISTE ANTES DE DEFINIR
let ProductCategory;

try {
  ProductCategory = mongoose.model('ProductCategory');
} catch (error) {
  const ProductCategorySchema = new mongoose.Schema({
    name: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    icon: {
      type: String,
      default: '📦'
    },
    order: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  });

  // Índices para performance
  ProductCategorySchema.index({ name: 1 });
  ProductCategorySchema.index({ isActive: 1 });
  ProductCategorySchema.index({ order: 1 });

  ProductCategory = mongoose.model('ProductCategory', ProductCategorySchema, 'productcategories');
}

module.exports = ProductCategory;
