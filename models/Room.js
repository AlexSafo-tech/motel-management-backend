// models/Room.js - MODELO CORRIGIDO SEM MAP
const mongoose = require('mongoose');

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

  // ✅ TIPO FLEXÍVEL
  type: {
    type: String,
    required: [true, 'Tipo do quarto é obrigatório'],
    trim: true,
    lowercase: true,
    default: 'standard',
    validate: {
      validator: function(v) {
        return v.length >= 2;
      },
      message: 'Tipo deve ter pelo menos 2 caracteres'
    }
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
        return /^[1-9]$/.test(v);
      },
      message: 'Andar deve ser um número de 1 a 9'
    }
  },

  // ✅ PREÇOS COMO OBJECT EM VEZ DE MAP
  prices: {
    type: Object,
    default: function() {
      return {
        '4h': 50.00,
        '6h': 70.00,
        '12h': 100.00,
        'daily': 150.00
      };
    },
    validate: {
      validator: function(prices) {
        // Verificar se todos os valores são números positivos
        return Object.values(prices).every(price => 
          typeof price === 'number' && price >= 0
        );
      },
      message: 'Todos os preços devem ser números não negativos'
    }
  },

  // ✅ PERÍODOS DISPONÍVEIS PARA ESTE QUARTO
  periods: {
    type: [{
      id: {
        type: String,
        required: true
      },
      nome: {
        type: String,
        required: true
      },
      preco: {
        type: Number,
        required: true,
        min: [0, 'Preço não pode ser negativo']
      },
      ativo: {
        type: Boolean,
        default: true
      }
    }],
    default: []
  },

  // ✅ PREÇO BASE (COMPATIBILIDADE)
  price: {
    type: Number,
    min: [0, 'Preço não pode ser negativo'],
    default: 50.00
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

  maintenanceReason: {
    type: String,
    trim: true,
    maxlength: [100, 'Motivo não pode ter mais de 100 caracteres']
  },

  isActive: {
    type: Boolean,
    default: true
  },

  // ✅ AUDITORIA
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
  timestamps: true,
  
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      
      // ✅ NÃO PRECISA CONVERTER MAP MAIS (agora é Object)
      return ret;
    }
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
  
  // Garantir que o preço base esteja sincronizado
  if (this.prices && Object.keys(this.prices).length > 0) {
    this.price = this.prices['4h'] || this.prices['daily'] || 50.00;
  }
  
  next();
});

// ✅ MÉTODOS DE INSTÂNCIA
roomSchema.methods.isAvailable = function() {
  return this.status === 'available';
};

roomSchema.methods.getPriceForPeriod = function(period) {
  if (this.prices && this.prices[period]) {
    return this.prices[period];
  }
  return this.price || 50.00;
};

roomSchema.methods.getFloorName = function() {
  const floorNames = {
    '1': '1º Andar',
    '2': '2º Andar', 
    '3': '3º Andar'
  };
  return floorNames[this.floor] || `${this.floor}º Andar`;
};

roomSchema.methods.hasPeriod = function(periodId) {
  return this.periods.some(p => p.id === periodId && p.ativo);
};

roomSchema.methods.getPeriod = function(periodId) {
  return this.periods.find(p => p.id === periodId);
};

// ✅ MÉTODOS ESTÁTICOS
roomSchema.statics.findByFloor = function(floor) {
  return this.find({ floor: floor.toString() });
};

roomSchema.statics.findAvailable = function() {
  return this.find({ status: 'available', isActive: true });
};

roomSchema.statics.findByType = function(type) {
  return this.find({ type: type.toLowerCase(), isActive: true });
};

roomSchema.statics.getStats = async function() {
  try {
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
          maintenance: {
            $sum: {
              $cond: [{ $eq: ['$status', 'maintenance'] }, 1, 0]
            }
          },
          cleaning: {
            $sum: {
              $cond: [{ $eq: ['$status', 'cleaning'] }, 1, 0]
            }
          }
        }
      }
    ]);

    return stats[0] || {
      total: 0,
      available: 0,
      occupied: 0,
      maintenance: 0,
      cleaning: 0
    };
  } catch (error) {
    console.error('❌ Erro ao obter estatísticas de quartos:', error);
    return {
      total: 0,
      available: 0,
      occupied: 0,
      maintenance: 0,
      cleaning: 0
    };
  }
};

// ✅ ÍNDICES
roomSchema.index({ floor: 1, status: 1 });
roomSchema.index({ type: 1, status: 1 });
roomSchema.index({ number: 1 }, { unique: true });

module.exports = mongoose.models.Room || mongoose.model('Room', roomSchema);
