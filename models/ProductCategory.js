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

module.exports = mongoose.model('ProductCategory', ProductCategorySchema, 'productcategories');
