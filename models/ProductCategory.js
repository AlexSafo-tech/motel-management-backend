const mongoose = require('mongoose');

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
  order: {                    // ✅ CAMPO ADICIONADO PARA REORDENAÇÃO
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

// ✅ ÍNDICES PARA PERFORMANCE
ProductCategorySchema.index({ name: 1 });
ProductCategorySchema.index({ isActive: 1 });
ProductCategorySchema.index({ order: 1 });              // ✅ ÍNDICE PARA ORDENAÇÃO
ProductCategorySchema.index({ order: 1, name: 1 });     // ✅ ÍNDICE COMPOSTO

// ✅ MIDDLEWARE PARA ATUALIZAR updatedAt AUTOMATICAMENTE
ProductCategorySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// ✅ MÉTODO ESTÁTICO PARA REORDENAR CATEGORIAS
ProductCategorySchema.statics.reorderCategories = async function(orderedIds) {
  const updatePromises = orderedIds.map((id, index) => 
    this.findByIdAndUpdate(
      id, 
      { order: index, updatedAt: new Date() },
      { new: true }
    )
  );
  
  return Promise.all(updatePromises);
};

// ✅ MÉTODO ESTÁTICO PARA BUSCAR CATEGORIAS ORDENADAS
ProductCategorySchema.statics.findAllOrdered = function(filter = {}) {
  return this.find({ ...filter, isActive: true })
    .sort({ order: 1, name: 1 });
};

module.exports = mongoose.model('ProductCategory', ProductCategorySchema, 'productcategories');
