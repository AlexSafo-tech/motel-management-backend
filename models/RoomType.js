// models/RoomType.js - MODELO PARA TIPOS DE QUARTO DINÂMICOS
const mongoose = require('mongoose');

const roomTypeSchema = new mongoose.Schema({
  id: {
    type: String,
    required: [true, 'ID do tipo é obrigatório'],
    unique: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^[a-z0-9_]+$/.test(v); // apenas letras minúsculas, números e underscore
      },
      message: 'ID deve conter apenas letras minúsculas, números e underscore'
    }
  },

  nome: {
    type: String,
    required: [true, 'Nome do tipo é obrigatório'],
    trim: true,
    maxlength: [50, 'Nome não pode ter mais de 50 caracteres'],
    validate: {
      validator: function(v) {
        return v.length >= 2;
      },
      message: 'Nome deve ter pelo menos 2 caracteres'
    }
  },

  // Configuração de períodos para este tipo
  periodosConfig: {
    type: Map,
    of: {
      ativo: { type: Boolean, default: true },
      preco: { 
        type: Number, 
        min: [0, 'Preço não pode ser negativo'],
        default: 50 
      },
      hoje: { type: Boolean, default: true }, // Disponível para reservas de hoje
      agendado: { type: Boolean, default: true } // Disponível para reservas agendadas
    },
    default: new Map()
  },

  // Preços base padrão (compatibilidade com Room.js atual)
  precosBase: {
    '4h': {
      type: Number,
      min: [0, 'Preço não pode ser negativo'],
      default: 50.00
    },
    '6h': {
      type: Number,
      min: [0, 'Preço não pode ser negativo'],
      default: 70.00
    },
    '12h': {
      type: Number,
      min: [0, 'Preço não pode ser negativo'],
      default: 100.00
    },
    'daily': {
      type: Number,
      min: [0, 'Preço não pode ser negativo'],
      default: 150.00
    }
  },

  // Amenidades padrão para este tipo
  amenidadesPadrao: {
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

  // Descrição do tipo
  descricao: {
    type: String,
    trim: true,
    maxlength: [200, 'Descrição não pode ter mais de 200 caracteres'],
    default: function() {
      return `Quarto tipo ${this.nome}`;
    }
  },

  // Controle de ativação
  active: {
    type: Boolean,
    default: true
  },

  // Ordem de exibição
  order: {
    type: Number,
    default: 0,
    min: [0, 'Ordem não pode ser negativa']
  },

  // Auditoria
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
      ret.id = ret.id || ret._id;
      delete ret._id;
      delete ret.__v;
      
      // Converter Map para Object para JSON
      if (ret.periodosConfig) {
        ret.periodosConfig = Object.fromEntries(ret.periodosConfig);
      }
      
      return ret;
    }
  }
});

// ✅ MIDDLEWARE PRE-SAVE
roomTypeSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// ✅ MÉTODOS DE INSTÂNCIA
roomTypeSchema.methods.getPrecoPorPeriodo = function(periodoId) {
  const config = this.periodosConfig.get(periodoId);
  if (config && config.ativo) {
    return config.preco;
  }
  
  // Fallback para preços base
  return this.precosBase[periodoId] || 50.00;
};

roomTypeSchema.methods.isPeriodoAtivo = function(periodoId) {
  const config = this.periodosConfig.get(periodoId);
  return config ? config.ativo : false;
};

roomTypeSchema.methods.isPeriodoDisponivelPara = function(periodoId, contexto) {
  const config = this.periodosConfig.get(periodoId);
  if (!config || !config.ativo) return false;
  
  return contexto === 'hoje' ? config.hoje : config.agendado;
};

// ✅ MÉTODOS ESTÁTICOS
roomTypeSchema.statics.findActive = function() {
  return this.find({ active: true }).sort({ order: 1, nome: 1 });
};

roomTypeSchema.statics.findByIds = function(ids) {
  return this.find({ id: { $in: ids }, active: true });
};

// ✅ CRIAR TIPOS PADRÃO SE NÃO EXISTIREM
roomTypeSchema.statics.criarTiposPadrao = async function() {
  try {
    const count = await this.countDocuments();
    
    if (count === 0) {
      console.log('🏷️ Criando tipos de quarto padrão...');
      
      const tiposPadrao = [
        {
          id: 'standard',
          nome: 'Standard',
          precosBase: { '4h': 50, '6h': 70, '12h': 100, 'daily': 150 },
          order: 1,
          descricao: 'Quarto padrão com comodidades básicas'
        },
        {
          id: 'premium',
          nome: 'Premium',
          precosBase: { '4h': 70, '6h': 90, '12h': 120, 'daily': 180 },
          order: 2,
          descricao: 'Quarto premium com comodidades superiores'
        },
        {
          id: 'luxo',
          nome: 'Luxo',
          precosBase: { '4h': 100, '6h': 130, '12h': 180, 'daily': 250 },
          order: 3,
          descricao: 'Quarto de luxo com máximo conforto'
        },
        {
          id: 'suite',
          nome: 'Suite',
          precosBase: { '4h': 150, '6h': 200, '12h': 280, 'daily': 350 },
          order: 4,
          descricao: 'Suite presidencial com todos os luxos'
        }
      ];
      
      await this.insertMany(tiposPadrao);
      console.log('✅ Tipos padrão criados com sucesso');
    }
  } catch (error) {
    console.error('❌ Erro ao criar tipos padrão:', error);
  }
};

// ✅ ÍNDICES
roomTypeSchema.index({ id: 1 }, { unique: true });
roomTypeSchema.index({ active: 1, order: 1 });
roomTypeSchema.index({ nome: 1 });

module.exports = mongoose.models.RoomType || mongoose.model('RoomType', roomTypeSchema);
