// models/Order.js - Modelo de pedido (frigobar/restaurante)

const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
    required: true
  },
  reservationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reservation',
    required: [true, 'Reserva é obrigatória']
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: [true, 'Cliente é obrigatório']
  },
  roomNumber: {
    type: String,
    required: [true, 'Número do quarto é obrigatório']
  },
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    productName: {
      type: String,
      required: true
    },
    productSku: {
      type: String
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0
    },
    notes: {
      type: String,
      trim: true
    }
  }],
  pricing: {
    subtotal: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0 },
    discountPercentage: { type: Number, default: 0 },
    serviceCharge: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: { type: Number, required: true, min: 0 }
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'],
    default: 'pending'
  },
  orderType: {
    type: String,
    enum: ['frigobar', 'room_service', 'restaurant', 'bar'],
    default: 'frigobar'
  },
  deliveryInfo: {
    location: {
      type: String,
      enum: ['room', 'reception', 'restaurant', 'pool_area'],
      default: 'room'
    },
    instructions: {
      type: String,
      trim: true
    },
    estimatedTime: {
      type: Number // em minutos
    },
    actualDeliveryTime: {
      type: Date
    }
  },
  paymentInfo: {
    method: {
      type: String,
      enum: ['room_charge', 'cash', 'credit_card', 'debit_card', 'pix'],
      default: 'room_charge'
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending'
    },
    paidAt: {
      type: Date
    },
    transactionId: {
      type: String
    }
  },
  customerInfo: {
    specialRequests: {
      type: String,
      trim: true
    },
    allergies: [{
      type: String
    }],
    preferences: {
      type: String,
      trim: true
    }
  },
  timeline: {
    orderedAt: { type: Date, default: Date.now },
    confirmedAt: { type: Date },
    preparingAt: { type: Date },
    readyAt: { type: Date },
    deliveredAt: { type: Date },
    cancelledAt: { type: Date }
  },
  staff: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    preparedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    deliveredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  rating: {
    score: { type: Number, min: 1, max: 5 },
    comment: { type: String, trim: true },
    ratedAt: { type: Date }
  },
  notes: {
    type: String,
    trim: true
  },
  cancelReason: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Middleware para gerar número do pedido
orderSchema.pre('save', async function(next) {
  if (this.isNew && !this.orderNumber) {
    const date = new Date();
    const year = date.getFullYear().toString().substr(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    // Buscar último número do pedido do dia
    const lastOrder = await this.constructor
      .findOne({
        orderNumber: new RegExp(`^ORD${year}${month}${day}`)
      })
      .sort({ orderNumber: -1 });
    
    let sequence = 1;
    if (lastOrder) {
      const lastSequence = parseInt(lastOrder.orderNumber.substr(-4));
      sequence = lastSequence + 1;
    }
    
    this.orderNumber = `ORD${year}${month}${day}${String(sequence).padStart(4, '0')}`;
  }
  next();
});

// Middleware para calcular preços
orderSchema.pre('save', function(next) {
  // Calcular total dos itens
  this.pricing.subtotal = this.items.reduce((sum, item) => {
    item.totalPrice = item.quantity * item.unitPrice;
    return sum + item.totalPrice;
  }, 0);
  
  // Calcular total final
  this.pricing.total = this.pricing.subtotal 
    - this.pricing.discountAmount 
    + this.pricing.serviceCharge 
    + this.pricing.tax;
  
  next();
});

// Middleware para atualizar timeline baseado no status
orderSchema.pre('save', function(next) {
  const now = new Date();
  
  if (this.isModified('status')) {
    switch(this.status) {
      case 'confirmed':
        if (!this.timeline.confirmedAt) this.timeline.confirmedAt = now;
        break;
      case 'preparing':
        if (!this.timeline.preparingAt) this.timeline.preparingAt = now;
        break;
      case 'ready':
        if (!this.timeline.readyAt) this.timeline.readyAt = now;
        break;
      case 'delivered':
        if (!this.timeline.deliveredAt) this.timeline.deliveredAt = now;
        break;
      case 'cancelled':
        if (!this.timeline.cancelledAt) this.timeline.cancelledAt = now;
        break;
    }
  }
  
  next();
});

// Índices para melhor performance
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ reservationId: 1 });
orderSchema.index({ customerId: 1 });
orderSchema.index({ roomNumber: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ orderType: 1 });
orderSchema.index({ createdAt: -1 });

// Virtual para tempo total de preparação
orderSchema.virtual('preparationTime').get(function() {
  if (!this.timeline.confirmedAt || !this.timeline.readyAt) return null;
  
  const diff = this.timeline.readyAt - this.timeline.confirmedAt;
  return Math.floor(diff / (1000 * 60)); // em minutos
});

// Virtual para verificar se está atrasado
orderSchema.virtual('isDelayed').get(function() {
  if (!this.deliveryInfo.estimatedTime || this.status === 'delivered' || this.status === 'cancelled') {
    return false;
  }
  
  const now = new Date();
  const estimatedDelivery = new Date(this.timeline.orderedAt.getTime() + (this.deliveryInfo.estimatedTime * 60 * 1000));
  
  return now > estimatedDelivery;
});

// Método para confirmar pedido
orderSchema.methods.confirm = function(userId) {
  this.status = 'confirmed';
  this.staff.confirmedBy = userId;
  return this.save();
};

// Método para marcar como preparando
orderSchema.methods.startPreparing = function(userId) {
  this.status = 'preparing';
  this.staff.preparedBy = userId;
  return this.save();
};

// Método para marcar como pronto
orderSchema.methods.markReady = function() {
  this.status = 'ready';
  return this.save();
};

// Método para marcar como entregue
orderSchema.methods.deliver = function(userId) {
  this.status = 'delivered';
  this.staff.deliveredBy = userId;
  this.deliveryInfo.actualDeliveryTime = new Date();
  return this.save();
};

// Método para cancelar pedido
orderSchema.methods.cancel = function(reason = '') {
  this.status = 'cancelled';
  this.cancelReason = reason;
  return this.save();
};

// Método para adicionar avaliação
orderSchema.methods.addRating = function(score, comment = '') {
  this.rating.score = score;
  this.rating.comment = comment;
  this.rating.ratedAt = new Date();
  return this.save();
};

module.exports = mongoose.model('Order', orderSchema);
