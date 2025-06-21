const mongoose = require('mongoose');

// ✅ VERIFICAR SE O MODELO JÁ EXISTE ANTES DE DEFINIR
let ProductCategory;

try {
  // Tentar obter o modelo se já existir
  ProductCategory = mongoose.model('ProductCategory');
} catch (error) {
  // Se não existir, definir o schema e modelo
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

  // ✅ USAR NOME ESPECÍFICO DA COLLECTION
  ProductCategory = mongoose.model('ProductCategory', ProductCategorySchema, 'productcategories');
}

module.exports = ProductCategory;
