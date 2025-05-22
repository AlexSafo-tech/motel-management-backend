// models/Product.js - Modelo de produto para frigobar/restaurante

const mongoose = require('mongoose');

const productCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Nome da categoria é obrigatório'],
    unique: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  icon: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Nome do produto é obrigatório'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductCategory',
    required: [true, 'Categoria é obrigatória']
  },
  sku: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  barcode: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  pricing: {
    cost: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 },
    margin: { type: Number },
    markup: { type: Number }
  },
  inventory: {
    currentStock: { type: Number, required: true, min: 0, default: 0 },
    minStock: { type: Number, required: true, min: 0, default: 5 },
    maxStock: { type: Number, min: 0 },
    reorderPoint: { type: Number, min: 0 },
    unit: { 
      type: String, 
      enum: ['unidade', 'kg', 'g', 'litro', 'ml', 'metro', 'cm'],
      default: 'unidade'
    }
  },
  supplier: {
    name: { type: String, trim: true },
    contact: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true }
  },
  specifications: {
    brand: { type: String, trim: true },
    model: { type: String, trim: true },
    weight: { type: Number },
    volume: { type: Number },
    dimensions: {
      length: { type: Number },
      width: { type: Number },
      height: { type: Number }
    },
    expirationDays: { type: Number }, // Dias de validade
    temperature: {
      min: { type: Number },
      max: { type: Number },
      storage: { 
        type: String, 
        enum: ['ambiente', 'refrigerado', 'congelado'],
        default: 'ambiente'
      }
    }
  },
  images: [{
    url: { type: String, trim: true },
    alt: { type: String, trim: true },
    isPrimary: { type: Boolean, default: false }
  }],
  tags: [{ type: String, trim: true }],
  availability: {
    isActive: { type: Boolean, default: true },
    isVisible: { type: Boolean, default: true },
    availableRooms: [{ type: String }], // Lista de quartos onde está disponível
    availableHours: {
      start: { type: String }, // "00:00"
      end: { type: String }    // "23:59"
    }
  },
  sales: {
    totalSold: { type: Number, default: 0 },
    lastSale: { type: Date },
    averageSalesPerMonth: { type: Number, default: 0 }
  },
  isPerishable: {
    type: Boolean,
    default: false
  },
  allergens: [{
    type: String,
    enum: ['gluten', 'lactose', 'nuts', 'soy', 'eggs', 'fish', 'shellfish']
  }],
  nutritionalInfo: {
    calories: { type: Number },
    protein: { type: Number },
    carbs: { type: Number },
    fat: { type: Number },
    fiber: { type: Number },
    sodium: { type: Number }
  }
}, {
  timestamps: true
});

// Middleware para calcular margem e markup
productSchema.pre('save', function(next) {
  if (this.pricing.cost && this.pricing.price) {
    this.pricing.margin = ((this.pricing.price - this.pricing.cost) / this.pricing.price) * 100;
    this.pricing.markup = ((this.pricing.price - this.pricing.cost) / this.pricing.cost) * 100;
  }
  next();
});

// Middleware para gerar SKU automático se não fornecido
productSchema.pre('save', async function(next) {
  if (this.isNew && !this.sku) {
    const category = await mongoose.model('ProductCategory').findById(this.category);
    if (category) {
      const categoryPrefix = category.name.substring(0, 3).toUpperCase();
      const timestamp = Date.now().toString().slice(-6);
      this.sku = `${categoryPrefix}${timestamp}`;
    }
  }
  next();
});

// Índices para melhor performance
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ sku: 1 });
productSchema.index({ barcode: 1 });
productSchema.index({ 'availability.isActive': 1, 'availability.isVisible': 1 });
productSchema.index({ 'inventory.currentStock': 1 });

// Virtual para verificar se está em estoque baixo
productSchema.virtual('isLowStock').get(function() {
  return this.inventory.currentStock <= this.inventory.minStock;
});

// Virtual para verificar se está em falta
productSchema.virtual('isOutOfStock').get(function() {
  return this.inventory.currentStock === 0;
});

// Virtual para verificar se precisa de reposição
productSchema.virtual('needsReorder').get(function() {
  return this.inventory.reorderPoint && 
         this.inventory.currentStock <= this.inventory.reorderPoint;
});

// Método para atualizar estoque
productSchema.methods.updateStock = function(quantity, operation = 'subtract') {
  if (operation === 'add') {
    this.inventory.currentStock += quantity;
  } else if (operation === 'subtract') {
    this.inventory.currentStock = Math.max(0, this.inventory.currentStock - quantity);
  } else if (operation === 'set') {
    this.inventory.currentStock = Math.max(0, quantity);
  }
  
  return this.save();
};

// Método para registrar venda
productSchema.methods.recordSale = function(quantity = 1) {
  this.sales.totalSold += quantity;
  this.sales.lastSale = new Date();
  this.inventory.currentStock = Math.max(0, this.inventory.currentStock - quantity);
  
  return this.save();
};

// Método para calcular valor do estoque
productSchema.methods.getStockValue = function() {
  return this.inventory.currentStock * this.pricing.cost;
};

const ProductCategory = mongoose.model('ProductCategory', productCategorySchema);
const Product = mongoose.model('Product', productSchema);

module.exports = { Product, ProductCategory };