// backend/models/Room.js - MODELO MELHORADO PARA MOTEL
const mongoose = require('mongoose');

// ✅ SCHEMA FLEXÍVEL E COMPLETO
const roomSchema = new mongoose.Schema({
  // ✅ CAMPOS OBRIGATÓRIOS
  number: {
    type: String,
    required: [true, 'Número do quarto é obrigatório'],
    unique: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^[0-9]{3}$/.test(v); // 3 dígitos: 101, 201, etc.
      },
      message: 'Número deve ter 3 dígitos (ex: 101, 201)'
    }
  },

  type: {
    type: String,
    required: [true, 'Tipo do quarto é obrigatório'],
    enum: {
      values: ['standard', 'premium', 'suite', 'luxo'],
      message: 'Tipo deve ser: standard, premium, suite ou luxo'
    },
    default: 'standard',
    lowercase: true
  },

  status: {
    type: String,
    required: [true, 'Status é obrigatório'],
    enum: {
      values: ['available', 'occupied', 'maintenance', 'cleaning'],
      message: 'Status deve ser: available, occupied, maintenance ou cleaning'
    },
    default: 'available'
  },

  // ✅ CAMPOS OPCIONAIS COM DEFAULTS
  capacity: {
    type: Number,
    required: [true, 'Capacidade é obrigatória'],
    min: [1, 'Capacidade mínima é 1'],
    max: [10, 'Capacidade máxima é 10'],
    default: 2
  },

  floor: {
    type: String,
    required: [true, 'Andar é obrigatório'],
    validate: {
      validator: function(v) {
        return /^[1-9]$/.test(v); // 1 dígito: 1, 2, 3, etc.
      },
      message: 'Andar deve ser um número de 1 a 9'
    }
  },

  // ✅ PREÇOS POR PERÍODO - FLEXÍVEL
  prices: {
    type: {
      '4h': {
        type: Number,
        required: [true, 'Preço 4h é obrigatório'],
        min: [0, 'Preço não pode ser negativo'],
        default: 50.00
      },
      '6h': {
        type: Number,
        required: [true, 'Preço 6h é obrigatório'],
        min: [0, 'Preço não pode ser negativo'],
        default: 70.00
      },
      '12h': {
        type: Number,
        required: [true, 'Preço 12h é obrigatório'],
        min: [0, 'Preço não pode ser negativo'],
        default: 100.00
      },
      'daily': {
        type: Number,
        required: [true, 'Preço diária é obrigatório'],
        min: [0, 'Preço não pode ser negativo'],
        default: 150.00
      }
    },
    required: [true, 'Preços são obrigatórios'],
    default: () => ({
      '4h': 50.00,
      '6h': 70.00,
      '12h': 100.00,
      'daily': 150.00
    })
  },

  // ✅ CAMPOS DESCRITIVOS
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Descrição não pode ter mais de 500 caracteres'],
    default: function() {
      return `Quarto ${this.number} - ${this.type}`;
    }
  },

  amenities: {
    type: [String],
    default: ['wifi', 'ar_condicionado', 'tv'],
    validate: {
      validator: function(amenities) {
        // Amenidades válidas
        const validAmenities = [
          'wifi', 'ar_condicionado', 'tv', 'frigobar', 'cofre', 
          'banheira', 'varanda', 'cama_king', 'cama_queen', 
          'mesa', 'cadeira', 'espelho', 'secador'
        ];
        return amenities.every(amenity => validAmenities.includes(amenity));
      },
      message: 'Amenidade inválida detectada'
    }
  },

  // ✅ CAMPOS DE CONTROLE
  isActive: {
    type: Boolean,
    default: true
  },

  // ✅ CAMPOS DE AUDITORIA
  createdAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  // ✅ OPÇÕES DO SCHEMA
  timestamps: true, // Adiciona createdAt e updatedAt automaticamente
  
  // ✅ TRANSFORMAÇÃO DO JSON
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  },

  // ✅ ÍNDICES PARA PERFORMANCE
  index: {
    number: 1,
    floor: 1,
    status: 1,
    type: 1
  }
});

// ✅ MIDDLEWARE PRE-SAVE
roomSchema.pre('save', function(next) {
  // Garantir que o andar seja inferido do número se não fornecido
  if (!this.floor && this.number) {
    this.floor = this.number.charAt(0);
  }

  // Atualizar timestamp
  this.updatedAt = new Date();
  
  next();
});

// ✅ MÉTODOS DE INSTÂNCIA
roomSchema.methods.isAvailable = function() {
  return this.status === 'available';
};

roomSchema.methods.getPriceForPeriod = function(period) {
  return this.prices[period] || this.prices['4h'];
};

roomSchema.methods.getFloorName = function() {
  const floorNames = {
    '1': '1º Andar',
    '2': '2º Andar', 
    '3': '3º Andar'
  };
  return floorNames[this.floor] || `${this.floor}º Andar`;
};

// ✅ MÉTODOS ESTÁTICOS
roomSchema.statics.findByFloor = function(floor) {
  return this.find({ floor: floor.toString() });
};

roomSchema.statics.findAvailable = function() {
  return this.find({ status: 'available', isActive: true });
};

roomSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        available: {
          $sum: {
            $cond: [{ $eq: ['$status', 'available'] }, 1, 0]
          }
        },
        occupied: {
          $sum: {
            $cond: [{ $eq: ['$status', 'occupied'] }, 1, 0]
          }
        },
        byFloor: {
          $push: {
            floor: '$floor',
            count: 1
          }
        }
      }
    }
  ]);

  return stats[0] || {
    total: 0,
    available: 0,
    occupied: 0,
    byFloor: []
  };
};

// ✅ ÍNDICES COMPOSTOS PARA QUERIES FREQUENTES
roomSchema.index({ floor: 1, status: 1 });
roomSchema.index({ type: 1, status: 1 });
roomSchema.index({ number: 1 }, { unique: true });

// ✅ CORREÇÃO DO ERRO: Evita sobrescrever modelo já compilado
module.exports = mongoose.models.Room || mongoose.model('Room', roomSchema);
