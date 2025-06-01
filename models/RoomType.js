// models/RoomType.js - MODELO CORRIGIDO SEM PREÇOS HARDCODED
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
        return /^[a-z0-9_]+$/.test(v);
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

  // ✅ CONFIGURAÇÃO DE PERÍODOS CORRIGIDA
  periodosConfig: {
    type: Object, // ❌ Mudado de Map para Object para evitar erro de serialização
    default: {}
  },

  // ✅ PREÇOS BASE SEM VALORES PADRÃO HARDCODED
  precosBase: {
    '4h': {
      type: Number,
      min: [0, 'Preço não pode ser negativo'],
      required: true // ❌ Tornado obrigatório, sem default
    },
    '6h': {
      type: Number,
      min: [0, 'Preço não pode ser negativo'],
      required: true // ❌ Tornado obrigatório, sem default
    },
    '12h': {
      type: Number,
      min: [0, 'Preço não pode ser negativo'],
      required: true // ❌ Tornado obrigatório, sem default
    },
    'daily': {
      type: Number,
      min: [0, 'Preço não pode ser negativo'],
      required: true // ❌ Tornado obrigatório, sem default
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
      return ret;
    }
  }
});

// ✅ MIDDLEWARE PRE-SAVE
roomTypeSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// ✅ MÉTODOS DE INSTÂNCIA SIMPLIFICADOS
roomTypeSchema.methods.getPrecoPorPeriodo = function(periodoId) {
  return this.precosBase[periodoId] || 0;
};

// ✅ MÉTODOS ESTÁTICOS
roomTypeSchema.statics.findActive = function() {
  return this.find({ active: true }).sort({ order: 1, nome: 1 });
};

roomTypeSchema.statics.findByIds = function(ids) {
  return this.find({ id: { $in: ids }, active: true });
};

// ✅ CRIAR TIPOS PADRÃO SEM PREÇOS HARDCODED - APENAS ESTRUTURA
roomTypeSchema.statics.criarTiposPadrao = async function() {
  try {
    const count = await this.countDocuments();
    
    if (count === 0) {
      console.log('🏷️ Criando estrutura de tipos padrão...');
      console.log('⚠️  ATENÇÃO: Você precisará definir os preços manualmente!');
      
      // ❌ REMOVIDO: Preços hardcoded
      // ✅ ADICIONADO: Apenas estrutura básica, preços devem ser definidos manualmente
      const tiposEstrutura = [
        {
          id: 'standard',
          nome: 'Standard',
          order: 1,
          descricao: 'Quarto padrão - DEFINA OS PREÇOS!'
        },
        {
          id: 'premium', 
          nome: 'Premium',
          order: 2,
          descricao: 'Quarto premium - DEFINA OS PREÇOS!'
        },
        {
          id: 'luxo',
          nome: 'Luxo', 
          order: 3,
          descricao: 'Quarto de luxo - DEFINA OS PREÇOS!'
        },
        {
          id: 'suite',
          nome: 'Suite',
          order: 4,
          descricao: 'Suite presidencial - DEFINA OS PREÇOS!'
        }
      ];
      
      console.log('⚠️  Tipos criados SEM preços - você deve definir os preços via API!');
      return { 
        success: false, 
        message: 'Tipos estruturais criados. Defina os preços via POST /api/room-types',
        tiposDisponiveis: tiposEstrutura 
      };
    } else {
      console.log('✅ Tipos já existem no banco');
      return { success: true, message: 'Tipos já existem' };
    }
  } catch (error) {
    console.error('❌ Erro ao verificar tipos:', error);
    throw error;
  }
};

// ✅ ÍNDICES
roomTypeSchema.index({ id: 1 }, { unique: true });
roomTypeSchema.index({ active: 1, order: 1 });
roomTypeSchema.index({ nome: 1 });

module.exports = mongoose.models.RoomType || mongoose.model('RoomType', roomTypeSchema);
