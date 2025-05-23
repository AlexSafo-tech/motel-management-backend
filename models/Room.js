// models/Room.js - Modelo de quarto do motel

const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  number: {
    type: String,
    required: [true, 'Número do quarto é obrigatório'],
    unique: true,
    trim: true
  },
  type: {
    type: String,
    required: [true, 'Tipo do quarto é obrigatório'],
    enum: ['Standard', 'Premium', 'Suite', 'Luxo'],
    default: 'Standard'
  },
  category: {
    type: String,
    enum: ['Simples', 'Casal', 'Família', 'VIP'],
    default: 'Casal'
  },
  capacity: {
    type: Number,
    required: [true, 'Capacidade é obrigatória'],
    min: 1,
    max: 6,
    default: 2
  },
  amenities: [{
    type: String,
    enum: [
      'TV', 'Ar Condicionado', 'Frigobar', 'Hidromassagem', 
      'Espelhos', 'Som Ambiente', 'WiFi', 'Garagem Privativa',
      'Decoração Temática', 'Pole Dance', 'Ducha', 'Sauna'
    ]
  }],
  pricing: {
    hourly: {
      type: Number,
      required: true,
      min: 0
    },
    period4h: {
      type: Number,
      required: true,
      min: 0
    },
    period12h: {
      type: Number,
      required: true,
      min: 0
    },
    daily: {
      type: Number,
      required: true,
      min: 0
    }
  },
  status: {
    type: String,
    enum: ['available', 'occupied', 'cleaning', 'maintenance', 'out_of_order'],
    default: 'available'
  },
  floor: {
    type: Number,
    min: 0,
    default: 1
  },
  description: {
    type: String,
    trim: true
  },
  images: [{
    type: String,
    validate: {
      validator: function(v) {
        return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(v);
      },
      message: 'URL da imagem deve ser válida'
    }
  }],
  lastCleaned: {
    type: Date
  },
  lastMaintenance: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Índices para melhor performance
roomSchema.index({ number: 1 });
roomSchema.index({ status: 1 });
roomSchema.index({ type: 1 });
roomSchema.index({ isActive: 1 });

// Método virtual para verificar se o quarto está disponível
roomSchema.virtual('isAvailable').get(function() {
  return this.status === 'available' && this.isActive;
});

// Método para calcular preço baseado no período
roomSchema.methods.calculatePrice = function(periodType, hours = 1) {
  switch(periodType) {
    case 'hourly':
      return this.pricing.hourly * hours;
    case '4h':
      return this.pricing.period4h;
    case '12h':
      return this.pricing.period12h;
    case 'daily':
      return this.pricing.daily;
    default:
      return this.pricing.hourly;
  }
};

// Middleware para atualizar timestamp quando status muda
roomSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    if (this.status === 'cleaning') {
      this.lastCleaned = new Date();
    }
    if (this.status === 'maintenance') {
      this.lastMaintenance = new Date();
    }
  }
  next();
});

module.exports = mongoose.model('Room', roomSchema);
