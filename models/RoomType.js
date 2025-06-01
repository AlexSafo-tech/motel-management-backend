// models/RoomType.js - TIPOS DE QUARTO COM PREÇOS POR PERÍODO
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
    maxlength: [50, 'Nome não pode ter mais de 50 caracteres']
  },

  // ✅ PREÇOS DINÂMICOS POR PERÍODO
  precosPorPeriodo: {
    type: Object, // { "4h": 55, "6h": 70, "12h": 90, "diaria": 120, "pernoite": 100 }
    default: {},
    validate: {
      validator: function(precos) {
        // Verificar se todos os valores são números positivos
        return Object.values(precos).every(preco => 
          typeof preco === 'number' && preco >= 0
        );
      },
      message: 'Todos os preços devem ser números não negativos'
    }
  },

  // ✅ PREÇOS BASE PARA COMPATIBILIDADE (DEPRECATED)
  precosBase: {
    '4h': { type: Number, min: 0 },
    '6h': { type: Number, min: 0 },
    '12h': { type: Number, min: 0 },
    'daily': { type: Number, min: 0 }
  },

  // Amenidades incluídas neste tipo
  amenidades: {
    type: [String],
    default: ['wifi', 'ar_condicionado', 'tv'],
    validate: {
      validator: function(amenities) {
        const validAmenities = [
          'wifi', 'ar_condicionado', 'tv', 'frigobar', 'cofre', 
          'banheira', 'varanda', 'cama_king', 'cama_queen', 
          'mesa', 'cadeira', 'espelho', 'secador', 'netflix',
          'hidromassagem', 'som_bluetooth', 'luzes_led'
        ];
        return amenities.every(amenity => validAmenities.includes(amenity));
      },
      message: 'Amenidade inválida detectada'
    }
  },

  // Configurações do tipo
  configuracao: {
    capacidadeMaxima: { type: Number, min: 1, max: 10, default: 2 },
    metrosQuadrados: { type: Number, min: 1 },
    andar: { type: String },
    vista: { 
      type: String, 
      enum: ['jardim', 'piscina', 'rua', 'interna', 'panoramica'], 
      default: 'interna' 
    },
    acessibilidade: { type: Boolean, default: false }
  },

  // Descrição e marketing
  descricao: {
    type: String,
    trim: true,
    maxlength: [500, 'Descrição não pode ter mais de 500 caracteres']
  },

  descricaoDetalhada: {
    type: String,
    trim: true,
    maxlength: [1000, 'Descrição detalhada não pode ter mais de 1000 caracteres']
  },

  // Imagens
  imagens: {
    principal: { type: String }, // URL da imagem principal
    galeria: [String], // Array de URLs
    thumb: { type: String } // Thumbnail para listagens
  },

  // Controles de disponibilidade
  disponibilidade: {
    ativo: { type: Boolean, default: true },
    aceitaReservaHoje: { type: Boolean, default: true },
    aceitaReservaAgendada: { type: Boolean, default: true },
    minimoAntecedencia: { type: Number, default: 0 }, // horas
    maximoAntecedencia: { type: Number, default: 720 } // horas (30 dias)
  },

  // Ordem de exibição
  ordem: {
    type: Number,
    default: 0,
    min: [0, 'Ordem não pode ser negativa']
  },

  // Auditoria
  criadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  atualizadoPor: {
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
  // Sincronizar preços base com preços por período (compatibilidade)
  if (this.precosPorPeriodo) {
    this.precosBase = {
      '4h': this.precosPorPeriodo['4h'] || 0,
      '6h': this.precosPorPeriodo['6h'] || 0, 
      '12h': this.precosPorPeriodo['12h'] || 0,
      'daily': this.precosPorPeriodo['diaria'] || 0
    };
  }
  
  next();
});

// ✅ MÉTODOS DE INSTÂNCIA
roomTypeSchema.methods.getPrecoPorPeriodo = function(periodoId) {
  return this.precosPorPeriodo[periodoId] || 0;
};

roomTypeSchema.methods.setPrecoPorPeriodo = function(periodoId, preco) {
  if (!this.precosPorPeriodo) {
    this.precosPorPeriodo = {};
  }
  this.precosPorPeriodo[periodoId] = preco;
};

roomTypeSchema.methods.temPrecoDefinido = function(periodoId) {
  return this.precosPorPeriodo && this.precosPorPeriodo[periodoId] > 0;
};

roomTypeSchema.methods.getPrecosPorPeriodo = function() {
  return this.precosPorPeriodo || {};
};

// ✅ MÉTODOS ESTÁTICOS
roomTypeSchema.statics.findAtivos = function() {
  return this.find({ 'disponibilidade.ativo': true }).sort({ ordem: 1, nome: 1 });
};

// ✅ COMPATIBILIDADE: Manter findActive para código antigo
roomTypeSchema.statics.findActive = function() {
  return this.findAtivos();
};

roomTypeSchema.statics.findComPrecos = function() {
  return this.find({ 
    'disponibilidade.ativo': true,
    precosPorPeriodo: { $exists: true, $ne: {} }
  }).sort({ ordem: 1 });
};

// ✅ CRIAR TIPOS PADRÃO COM PREÇOS BASE
roomTypeSchema.statics.criarTiposPadrao = async function() {
  try {
    const count = await this.countDocuments();
    
    if (count === 0) {
      console.log('🏷️ Criando tipos de quarto padrão com preços base...');
      
      const tiposPadrao = [
        {
          id: 'standard',
          nome: 'Standard',
          precosPorPeriodo: {
            '4h': 55,
            '6h': 70, 
            '12h': 90,
            'diaria': 120,
            'pernoite': 100
          },
          configuracao: {
            capacidadeMaxima: 2,
            metrosQuadrados: 25
          },
          descricao: 'Quarto padrão com comodidades essenciais',
          ordem: 1
        },
        {
          id: 'premium',
          nome: 'Premium', 
          precosPorPeriodo: {
            '4h': 75,
            '6h': 95,
            '12h': 115, 
            'diaria': 150,
            'pernoite': 130
          },
          configuracao: {
            capacidadeMaxima: 2,
            metrosQuadrados: 35
          },
          amenidades: ['wifi', 'ar_condicionado', 'tv', 'frigobar', 'netflix'],
          descricao: 'Quarto premium com amenidades superiores',
          ordem: 2
        },
        {
          id: 'luxo',
          nome: 'Luxo',
          precosPorPeriodo: {
            '4h': 100,
            '6h': 130,
            '12h': 160,
            'diaria': 200, 
            'pernoite': 170
          },
          configuracao: {
            capacidadeMaxima: 2,
            metrosQuadrados: 45,
            vista: 'jardim'
          },
          amenidades: ['wifi', 'ar_condicionado', 'tv', 'frigobar', 'netflix', 'hidromassagem', 'som_bluetooth'],
          descricao: 'Quarto de luxo com máximo conforto e vista privilegiada',
          ordem: 3
        },
        {
          id: 'suite',
          nome: 'Suite Presidential',
          precosPorPeriodo: {
            '4h': 150,
            '6h': 200,
            '12h': 250,
            'diaria': 300,
            'pernoite': 250
          },
          configuracao: {
            capacidadeMaxima: 4,
            metrosQuadrados: 60,
            vista: 'panoramica'
          },
          amenidades: ['wifi', 'ar_condicionado', 'tv', 'frigobar', 'netflix', 'hidromassagem', 'som_bluetooth', 'varanda', 'luzes_led'],
          descricao: 'Suite presidencial com todos os luxos e vista panorâmica',
          ordem: 4
        }
      ];
      
      await this.insertMany(tiposPadrao);
      console.log('✅ Tipos padrão criados com preços base');
      return tiposPadrao;
    } else {
      console.log('✅ Tipos já existem');
      return await this.findAtivos();
    }
  } catch (error) {
    console.error('❌ Erro ao criar tipos padrão:', error);
    throw error;
  }
};

// ✅ ÍNDICES
roomTypeSchema.index({ id: 1 }, { unique: true });
roomTypeSchema.index({ 'disponibilidade.ativo': 1, ordem: 1 });
roomTypeSchema.index({ nome: 1 });

module.exports = mongoose.models.RoomType || mongoose.model('RoomType', roomTypeSchema);
