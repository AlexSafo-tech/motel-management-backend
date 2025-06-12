// models/Product.js - Modelo REVOLUCIONÁRIO com Sistema de Variações

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

// ✅ ESQUEMA PARA VARIAÇÕES DE PRODUTOS
const productVariationSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: false // Único dentro do produto, não globalmente
  },
  nome: {
    type: String,
    required: [true, 'Nome da variação é obrigatório'],
    trim: true
  },
  quantidade: {
    type: Number,
    required: [true, 'Quantidade da variação é obrigatória'],
    min: 0
  },
  unidade: {
    type: String,
    required: [true, 'Unidade da variação é obrigatória'],
    enum: ['unidade', 'ml', 'g', 'kg', 'litro', 'copo', 'dose', 'jarra', 'porção'],
    default: 'unidade'
  },
  preco: {
    type: Number,
    required: [true, 'Preço da variação é obrigatório'],
    min: 0
  },
  sku: {
    type: String,
    trim: true
  },
  ativo: {
    type: Boolean,
    default: true
  }
}, { _id: false });

const productSchema = new mongoose.Schema({
  // ✅ CAMPOS BÁSICOS DO PRODUTO
  nome: {
    type: String,
    required: [true, 'Nome do produto é obrigatório'],
    trim: true
  },
  name: { // Mantido para compatibilidade com API antiga
    type: String,
    trim: true
  },
  descricao: {
    type: String,
    trim: true
  },
  description: { // Mantido para compatibilidade
    type: String,
    trim: true
  },
  categoria: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductCategory',
    required: [true, 'Categoria é obrigatória']
  },
  category: { // Mantido para compatibilidade
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductCategory'
  },

  // ✅ NOVO SISTEMA DE VARIAÇÕES
  tipo: {
    type: String,
    enum: ['produto_simples', 'produto_variavel'],
    default: 'produto_simples'
  },
  
  // ✅ ESTOQUE BASE (para produtos variáveis)
  estoque_base: {
    quantidade: { 
      type: Number, 
      required: true, 
      min: 0, 
      default: 0 
    },
    unidade: { 
      type: String, 
      enum: ['unidade', 'kg', 'g', 'litro', 'ml', 'metro', 'cm', 'garrafa', 'saco'],
      default: 'unidade'
    },
    volume_por_unidade: { 
      type: Number, 
      min: 0 
    }, // Ex: 1000ml por garrafa, 5000g por saco
    volume_total: { 
      type: Number, 
      min: 0 
    } // Calculado automaticamente
  },

  // ✅ VARIAÇÕES DO PRODUTO
  variacoes: [productVariationSchema],

  // ✅ CAMPOS PARA PRODUTOS SIMPLES (mantidos para compatibilidade)
  preco: {
    type: Number,
    min: 0
  },
  estoque: {
    type: Number,
    min: 0,
    default: 0
  },

  // ✅ CAMPOS DE COMPATIBILIDADE COM SISTEMA ANTIGO
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
    cost: { type: Number, min: 0 },
    price: { type: Number, min: 0 },
    margin: { type: Number },
    markup: { type: Number }
  },
  inventory: {
    currentStock: { type: Number, min: 0, default: 0 },
    minStock: { type: Number, min: 0, default: 5 },
    maxStock: { type: Number, min: 0 },
    reorderPoint: { type: Number, min: 0 },
    unit: { 
      type: String, 
      enum: ['unidade', 'kg', 'g', 'litro', 'ml', 'metro', 'cm'],
      default: 'unidade'
    }
  },

  // ✅ CAMPOS DE CONTROLE
  ativo: {
    type: Boolean,
    default: true
  },
  apenas_admin: {
    type: Boolean,
    default: false
  },

  // ✅ CAMPOS ADICIONAIS MANTIDOS
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
    expirationDays: { type: Number },
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
    availableRooms: [{ type: String }],
    availableHours: {
      start: { type: String },
      end: { type: String }
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

// ✅ MIDDLEWARE PARA SINCRONIZAR CAMPOS DE COMPATIBILIDADE
productSchema.pre('save', function(next) {
  // Sincronizar campos novos com antigos
  if (this.nome && !this.name) this.name = this.nome;
  if (this.name && !this.nome) this.nome = this.name;
  if (this.descricao && !this.description) this.description = this.descricao;
  if (this.description && !this.descricao) this.descricao = this.description;
  if (this.categoria && !this.category) this.category = this.categoria;
  if (this.category && !this.categoria) this.categoria = this.category;

  // Sincronizar preço e estoque para produtos simples
  if (this.tipo === 'produto_simples') {
    if (this.preco && this.pricing) this.pricing.price = this.preco;
    if (this.pricing?.price && !this.preco) this.preco = this.pricing.price;
    if (this.estoque && this.inventory) this.inventory.currentStock = this.estoque;
    if (this.inventory?.currentStock !== undefined && this.estoque === undefined) {
      this.estoque = this.inventory.currentStock;
    }
  }

  // Calcular volume total para produtos variáveis
  if (this.tipo === 'produto_variavel' && this.estoque_base.quantidade && this.estoque_base.volume_por_unidade) {
    this.estoque_base.volume_total = this.estoque_base.quantidade * this.estoque_base.volume_por_unidade;
  }

  next();
});

// ✅ MIDDLEWARE PARA CALCULAR MARGEM E MARKUP (mantido)
productSchema.pre('save', function(next) {
  if (this.pricing?.cost && this.pricing?.price) {
    this.pricing.margin = ((this.pricing.price - this.pricing.cost) / this.pricing.price) * 100;
    this.pricing.markup = ((this.pricing.price - this.pricing.cost) / this.pricing.cost) * 100;
  }
  next();
});

// ✅ MIDDLEWARE PARA GERAR SKU AUTOMÁTICO (mantido)
productSchema.pre('save', async function(next) {
  if (this.isNew && !this.sku) {
    const category = await mongoose.model('ProductCategory').findById(this.categoria || this.category);
    if (category) {
      const categoryPrefix = category.name.substring(0, 3).toUpperCase();
      const timestamp = Date.now().toString().slice(-6);
      this.sku = `${categoryPrefix}${timestamp}`;
    }
  }
  next();
});

// ✅ ÍNDICES ATUALIZADOS
productSchema.index({ nome: 'text', descricao: 'text', name: 'text', description: 'text' });
productSchema.index({ categoria: 1, category: 1 });
productSchema.index({ sku: 1 });
productSchema.index({ barcode: 1 });
productSchema.index({ ativo: 1, 'availability.isActive': 1, 'availability.isVisible': 1 });
productSchema.index({ estoque: 1, 'inventory.currentStock': 1 });
productSchema.index({ tipo: 1 });

// ✅ VIRTUALS ATUALIZADOS PARA COMPATIBILIDADE
productSchema.virtual('isLowStock').get(function() {
  if (this.tipo === 'produto_simples') {
    return (this.estoque || this.inventory?.currentStock || 0) <= (this.inventory?.minStock || 5);
  }
  // Para produtos variáveis, verificar se alguma variação está com estoque baixo
  return this.estoque_base.quantidade <= 5;
});

productSchema.virtual('isOutOfStock').get(function() {
  if (this.tipo === 'produto_simples') {
    return (this.estoque || this.inventory?.currentStock || 0) === 0;
  }
  return this.estoque_base.quantidade === 0;
});

productSchema.virtual('needsReorder').get(function() {
  if (this.tipo === 'produto_simples') {
    return this.inventory?.reorderPoint && 
           (this.estoque || this.inventory?.currentStock || 0) <= this.inventory.reorderPoint;
  }
  return this.estoque_base.quantidade <= 10; // Reorder point para produtos variáveis
});

// ✅ MÉTODOS PARA PRODUTOS VARIÁVEIS

// Adicionar nova variação
productSchema.methods.adicionarVariacao = function(variacao) {
  if (!variacao.id) {
    variacao.id = `var_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  this.variacoes.push(variacao);
  return this.save();
};

// Remover variação
productSchema.methods.removerVariacao = function(variacaoId) {
  this.variacoes = this.variacoes.filter(v => v.id !== variacaoId);
  return this.save();
};

// Atualizar variação
productSchema.methods.atualizarVariacao = function(variacaoId, dadosAtualizados) {
  const variacao = this.variacoes.find(v => v.id === variacaoId);
  if (variacao) {
    Object.keys(dadosAtualizados).forEach(key => {
      if (dadosAtualizados[key] !== undefined) {
        variacao[key] = dadosAtualizados[key];
      }
    });
  }
  return this.save();
};

// ✅ CALCULAR ESTOQUE DISPONÍVEL PARA VARIAÇÕES
productSchema.methods.calcularEstoqueVariacao = function(variacaoId) {
  if (this.tipo === 'produto_simples') {
    return this.estoque || this.inventory?.currentStock || 0;
  }

  const variacao = this.variacoes.find(v => v.id === variacaoId);
  if (!variacao) return 0;

  const volumeTotalDisponivel = this.estoque_base.volume_total || 0;
  const volumePorVariacao = variacao.quantidade;

  if (volumePorVariacao <= 0) return 0;

  // Calcular quantas unidades desta variação podem ser feitas
  return Math.floor(volumeTotalDisponivel / volumePorVariacao);
};

// ✅ OBTER TODAS AS VARIAÇÕES COM ESTOQUE CALCULADO
productSchema.methods.getVariacoesComEstoque = function() {
  if (this.tipo === 'produto_simples') {
    return [{
      id: 'default',
      nome: this.nome || this.name,
      quantidade: 1,
      unidade: this.inventory?.unit || 'unidade',
      preco: this.preco || this.pricing?.price || 0,
      estoque_disponivel: this.estoque || this.inventory?.currentStock || 0,
      ativo: this.ativo && (this.availability?.isActive !== false)
    }];
  }

  return this.variacoes.map(variacao => ({
    ...variacao.toObject(),
    estoque_disponivel: this.calcularEstoqueVariacao(variacao.id),
    disponivel: this.calcularEstoqueVariacao(variacao.id) > 0
  }));
};

// ✅ MÉTODOS ATUALIZADOS PARA COMPATIBILIDADE

// Atualizar estoque (compatível com ambos os sistemas)
productSchema.methods.updateStock = function(quantity, operation = 'subtract') {
  if (this.tipo === 'produto_simples') {
    // Sistema antigo
    if (operation === 'add') {
      this.estoque = (this.estoque || 0) + quantity;
      if (this.inventory) this.inventory.currentStock = this.estoque;
    } else if (operation === 'subtract') {
      this.estoque = Math.max(0, (this.estoque || 0) - quantity);
      if (this.inventory) this.inventory.currentStock = this.estoque;
    } else if (operation === 'set') {
      this.estoque = Math.max(0, quantity);
      if (this.inventory) this.inventory.currentStock = this.estoque;
    }
  } else {
    // Sistema novo - atualizar estoque base
    if (operation === 'add') {
      this.estoque_base.quantidade += quantity;
    } else if (operation === 'subtract') {
      this.estoque_base.quantidade = Math.max(0, this.estoque_base.quantidade - quantity);
    } else if (operation === 'set') {
      this.estoque_base.quantidade = Math.max(0, quantity);
    }
    
    // Recalcular volume total
    if (this.estoque_base.volume_por_unidade) {
      this.estoque_base.volume_total = this.estoque_base.quantidade * this.estoque_base.volume_por_unidade;
    }
  }
  
  return this.save();
};

// Registrar venda (adaptado para variações)
productSchema.methods.recordSale = function(quantity = 1, variacaoId = null) {
  this.sales.totalSold += quantity;
  this.sales.lastSale = new Date();
  
  if (this.tipo === 'produto_simples') {
    this.estoque = Math.max(0, (this.estoque || 0) - quantity);
    if (this.inventory) this.inventory.currentStock = this.estoque;
  } else if (variacaoId) {
    // Para produtos variáveis, reduzir do estoque base baseado no volume da variação
    const variacao = this.variacoes.find(v => v.id === variacaoId);
    if (variacao) {
      const volumeConsumido = variacao.quantidade * quantity;
      const novoVolumeTotal = Math.max(0, this.estoque_base.volume_total - volumeConsumido);
      this.estoque_base.volume_total = novoVolumeTotal;
      
      // Recalcular quantidade base
      if (this.estoque_base.volume_por_unidade > 0) {
        this.estoque_base.quantidade = Math.floor(novoVolumeTotal / this.estoque_base.volume_por_unidade);
      }
    }
  }
  
  return this.save();
};

// Calcular valor do estoque (compatível)
productSchema.methods.getStockValue = function() {
  if (this.tipo === 'produto_simples') {
    const stock = this.estoque || this.inventory?.currentStock || 0;
    const cost = this.pricing?.cost || 0;
    return stock * cost;
  } else {
    // Para produtos variáveis, usar a variação mais cara como referência
    const variacaoMaisCara = this.variacoes.reduce((max, v) => v.preco > max.preco ? v : max, { preco: 0 });
    return this.estoque_base.quantidade * (variacaoMaisCara.preco || 0);
  }
};

const ProductCategory = mongoose.model('ProductCategory', productCategorySchema);
const Product = mongoose.model('Product', productSchema);

module.exports = { Product, ProductCategory };
