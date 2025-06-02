// models/RoomType.js - MODELO COMPLETO COM DISPONIBILIDADE POR PERÍODO
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
    type: Map,
    of: Number,
    default: new Map(),
    validate: {
      validator: function(precos) {
        if (!precos) return true;
        for (let [key, value] of precos) {
          if (typeof value !== 'number' || value < 0) {
            return false;
          }
        }
        return true;
      },
      message: 'Todos os preços devem ser números não negativos'
    }
  },

  // ✅ DISPONIBILIDADE POR PERÍODO
  disponibilidadePorPeriodo: {
    type: Map,
    of: {
      hoje: { type: Boolean, default: true },
      agendado: { type: Boolean, default: true },
      availableFor: [String] // ["today", "future"]
    },
    default: new Map()
  },

  // ✅ CONFIGURAÇÕES COMPLETAS POR PERÍODO
  configuracoesCompletas: {
    type: Map,
    of: {
      ativo: { type: Boolean, default: true },
      preco: { type: Number, min: 0 },
      hoje: { type: Boolean, default: true },
      agendado: { type: Boolean, default: true },
      availableFor: [String]
    },
    default: new Map()
  },

  // ✅ CAMPOS SIMPLIFICADOS PARA CONSULTA RÁPIDA
  periodosHoje: {
    type: [String],
    default: []
  },

  periodosAgendado: {
    type: [String], 
    default: []
  },

  // ✅ PREÇOS BASE PARA COMPATIBILIDADE (DEPRECATED)
  precosBase: {
    '4h': { type: Number, min: 0, default: 55 },
    '6h': { type: Number, min: 0, default: 70 },
    '12h': { type: Number, min: 0, default: 90 },
    'daily': { type: Number, min: 0, default: 120 }
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
    principal: { type: String },
    galeria: [String],
    thumb: { type: String }
  },

  // ✅ CONTROLES DE DISPONIBILIDADE (DUPLO PARA COMPATIBILIDADE)
  disponibilidade: {
    ativo: { type: Boolean, default: true },
    aceitaReservaHoje: { type: Boolean, default: true },
    aceitaReservaAgendada: { type: Boolean, default: true },
    minimoAntecedencia: { type: Number, default: 0 },
    maximoAntecedencia: { type: Number, default: 720 }
  },

  // ✅ CAMPO ATIVO PARA COMPATIBILIDADE
  ativo: {
    type: Boolean,
    default: true
  },

  // ✅ CAMPO ACTIVE PARA COMPATIBILIDADE
  active: {
    type: Boolean,
    default: true
  },

  // Ordem de exibição
  ordem: {
    type: Number,
    default: 0,
    min: [0, 'Ordem não pode ser negativa']
  },

  // ✅ CAMPO ORDER PARA COMPATIBILIDADE
  order: {
    type: Number,
    default: 0,
    min: [0, 'Ordem não pode ser negativa']
  },

  // ✅ NOVOS CAMPOS PARA DISPONIBILIDADE DETALHADA
  disponibilidadePorPeriodo: {
    type: Object,
    default: {},
    // Ex: { "4h": { hoje: true, agendado: false }, "diaria": { hoje: true, agendado: true } }
  },
  configuracoesCompletas: {
    type: Object,
    default: {},
    // Ex: { "4h": { ativo: true, preco: 55, hoje: true, agendado: false } }
  },
  // ✅ LISTAS PARA CONSULTA RÁPIDA
  periodosHoje: {
    type: [String],
    default: [],
    // Ex: ["4h", "6h", "12h", "diaria"]
  },
  periodosAgendado: {
    type: [String],
    default: [],
    // Ex: ["diaria", "pernoite"]
  },

  // Auditoria
  criadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  atualizadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // ✅ CAMPOS DE AUDITORIA ALTERNATIVOS
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
  // Sincronizar campos duplicados
  if (this.isModified('ativo')) {
    this.disponibilidade = this.disponibilidade || {};
    this.disponibilidade.ativo = this.ativo;
    this.active = this.ativo;
  }
  
  if (this.isModified('active')) {
    this.ativo = this.active;
    this.disponibilidade = this.disponibilidade || {};
    this.disponibilidade.ativo = this.active;
  }
  
  if (this.isModified('ordem')) {
    this.order = this.ordem;
  }
  
  if (this.isModified('order')) {
    this.ordem = this.order;
  }
  
  // ✅ SINCRONIZAR PREÇOS E DISPONIBILIDADE
  if (this.isModified('precosPorPeriodo') || this.isModified('disponibilidadePorPeriodo')) {
    this.syncPeriodData();
  }
  
  // Sincronizar preços base com preços por período
  if (this.precosPorPeriodo && this.precosPorPeriodo.size > 0) {
    this.precosBase = {
      '4h': this.precosPorPeriodo.get('4h') || this.precosBase['4h'] || 55,
      '6h': this.precosPorPeriodo.get('6h') || this.precosBase['6h'] || 70,
      '12h': this.precosPorPeriodo.get('12h') || this.precosBase['12h'] || 90,
      'daily': this.precosPorPeriodo.get('diaria') || this.precosBase['daily'] || 120
    };
  }
  
  next();
});

// ✅ MÉTODOS DE INSTÂNCIA
roomTypeSchema.methods.getPrecoPorPeriodo = function(periodoId) {
  return this.precosPorPeriodo?.get(periodoId) || this.precosBase?.[periodoId] || 0;
};

roomTypeSchema.methods.setPrecoPorPeriodo = function(periodoId, preco) {
  if (!this.precosPorPeriodo) {
    this.precosPorPeriodo = new Map();
  }
  this.precosPorPeriodo.set(periodoId, preco);
};

roomTypeSchema.methods.temPrecoDefinido = function(periodoId) {
  return (this.precosPorPeriodo && this.precosPorPeriodo.get(periodoId) > 0) ||
         (this.precosBase && this.precosBase[periodoId] > 0);
};

roomTypeSchema.methods.getPrecosPorPeriodo = function() {
  if (this.precosPorPeriodo instanceof Map) {
    return Object.fromEntries(this.precosPorPeriodo);
  }
  return this.precosPorPeriodo || {};
};

roomTypeSchema.methods.isAtivo = function() {
  return this.ativo || this.active || this.disponibilidade?.ativo || false;
};

// ✅ NOVOS MÉTODOS PARA DISPONIBILIDADE POR PERÍODO
roomTypeSchema.methods.isPeriodoDisponivelHoje = function(periodoId) {
  const config = this.disponibilidadePorPeriodo?.get(periodoId);
  return config?.hoje || this.periodosHoje?.includes(periodoId) || false;
};

roomTypeSchema.methods.isPeriodoDisponivelAgendado = function(periodoId) {
  const config = this.disponibilidadePorPeriodo?.get(periodoId);
  return config?.agendado || this.periodosAgendado?.includes(periodoId) || false;
};

roomTypeSchema.methods.setDisponibilidadePeriodo = function(periodoId, hoje, agendado) {
  if (!this.disponibilidadePorPeriodo) {
    this.disponibilidadePorPeriodo = new Map();
  }
  
  this.disponibilidadePorPeriodo.set(periodoId, {
    hoje: hoje,
    agendado: agendado,
    availableFor: []
  });
  
  if (hoje) this.availableFor.push('today');
  if (agendado) this.availableFor.push('future');
  
  this.syncPeriodData();
};

roomTypeSchema.methods.syncPeriodData = function() {
  const periodosHoje = [];
  const periodosAgendado = [];
  
  if (this.disponibilidadePorPeriodo instanceof Map) {
    for (let [periodoId, config] of this.disponibilidadePorPeriodo) {
      if (config.hoje) periodosHoje.push(periodoId);
      if (config.agendado) periodosAgendado.push(periodoId);
    }
  }
  
  this.periodosHoje = periodosHoje;
  this.periodosAgendado = periodosAgendado;
  
  // Atualizar disponibilidade geral
  this.disponibilidade.aceitaReservaHoje = periodosHoje.length > 0;
  this.disponibilidade.aceitaReservaAgendada = periodosAgendado.length > 0;
};

roomTypeSchema.methods.getConfiguracoesCompletas = function() {
  if (this.configuracoesCompletas instanceof Map) {
    return Object.fromEntries(this.configuracoesCompletas);
  }
  return this.configuracoesCompletas || {};
};

// ✅ MÉTODOS ESTÁTICOS CORRIGIDOS
roomTypeSchema.statics.findAtivos = function() {
  return this.find({ 
    $or: [
      { 'disponibilidade.ativo': true },
      { 'ativo': true },
      { 'active': true }
    ]
  }).sort({ ordem: 1, order: 1, nome: 1 });
};

roomTypeSchema.statics.findActive = function() {
  return this.findAtivos();
};

roomTypeSchema.statics.findComPrecos = function() {
  return this.find({ 
    $or: [
      { 'disponibilidade.ativo': true },
      { 'ativo': true },
      { 'active': true }
    ],
    $or: [
      { precosPorPeriodo: { $exists: true, $ne: {} } },
      { precosBase: { $exists: true, $ne: {} } }
    ]
  }).sort({ ordem: 1, order: 1 });
};

roomTypeSchema.statics.findByIds = function(ids) {
  return this.find({ 
    id: { $in: ids }, 
    $or: [
      { 'disponibilidade.ativo': true },
      { 'ativo': true },
      { 'active': true }
    ]
  });
};

roomTypeSchema.statics.findDisponivelParaPeriodo = function(periodoId, contexto = 'hoje') {
  const campo = contexto === 'hoje' ? 'periodosHoje' : 'periodosAgendado';
  return this.find({
    $or: [
      { 'disponibilidade.ativo': true },
      { 'ativo': true },
      { 'active': true }
    ],
    [campo]: periodoId
  }).sort({ ordem: 1 });
};

// ✅ CRIAR TIPOS PADRÃO COM PREÇOS BASE E DISPONIBILIDADE
roomTypeSchema.statics.criarTiposPadrao = async function() {
  try {
    const count = await this.countDocuments();
    
    if (count === 0) {
      console.log('🏷️ Criando tipos de quarto padrão com disponibilidade por período...');
      
      const tiposParaCriar = [
        {
          id: 'standard',
          nome: 'Standard',
          precosPorPeriodo: new Map([
            ['4h', 55],
            ['6h', 70], 
            ['12h', 90],
            ['diaria', 120],
            ['pernoite', 100]
          ]),
          disponibilidadePorPeriodo: new Map([
            ['4h', { hoje: true, agendado: false, availableFor: ['today'] }],
            ['6h', { hoje: true, agendado: false, availableFor: ['today'] }],
            ['12h', { hoje: true, agendado: false, availableFor: ['today'] }],
            ['diaria', { hoje: true, agendado: true, availableFor: ['today', 'future'] }],
            ['pernoite', { hoje: false, agendado: true, availableFor: ['future'] }]
          ]),
          periodosHoje: ['4h', '6h', '12h', 'diaria'],
          periodosAgendado: ['diaria', 'pernoite'],
          configuracao: {
            capacidadeMaxima: 2,
            metrosQuadrados: 25
          },
          descricao: 'Quarto padrão com comodidades essenciais',
          ordem: 1,
          ativo: true,
          active: true
        },
        {
          id: 'premium',
          nome: 'Premium', 
          precosPorPeriodo: new Map([
            ['4h', 75],
            ['6h', 95],
            ['12h', 115], 
            ['diaria', 150],
            ['pernoite', 130]
          ]),
          disponibilidadePorPeriodo: new Map([
            ['4h', { hoje: true, agendado: false, availableFor: ['today'] }],
            ['6h', { hoje: true, agendado: false, availableFor: ['today'] }],
            ['12h', { hoje: true, agendado: false, availableFor: ['today'] }],
            ['diaria', { hoje: true, agendado: true, availableFor: ['today', 'future'] }],
            ['pernoite', { hoje: false, agendado: true, availableFor: ['future'] }]
          ]),
          periodosHoje: ['4h', '6h', '12h', 'diaria'],
          periodosAgendado: ['diaria', 'pernoite'],
          configuracao: {
            capacidadeMaxima: 2,
            metrosQuadrados: 35
          },
          amenidades: ['wifi', 'ar_condicionado', 'tv', 'frigobar', 'netflix'],
          descricao: 'Quarto premium com amenidades superiores',
          ordem: 2,
          ativo: true,
          active: true
        },
        {
          id: 'luxo',
          nome: 'Luxo',
          precosPorPeriodo: new Map([
            ['4h', 100],
            ['6h', 130],
            ['12h', 160],
            ['diaria', 200], 
            ['pernoite', 170]
          ]),
          disponibilidadePorPeriodo: new Map([
            ['4h', { hoje: true, agendado: false, availableFor: ['today'] }],
            ['6h', { hoje: true, agendado: false, availableFor: ['today'] }],
            ['12h', { hoje: true, agendado: false, availableFor: ['today'] }],
            ['diaria', { hoje: true, agendado: true, availableFor: ['today', 'future'] }],
            ['pernoite', { hoje: false, agendado: true, availableFor: ['future'] }]
          ]),
          periodosHoje: ['4h', '6h', '12h', 'diaria'],
          periodosAgendado: ['diaria', 'pernoite'],
          configuracao: {
            capacidadeMaxima: 2,
            metrosQuadrados: 45,
            vista: 'jardim'
          },
          amenidades: ['wifi', 'ar_condicionado', 'tv', 'frigobar', 'netflix', 'hidromassagem', 'som_bluetooth'],
          descricao: 'Quarto de luxo com máximo conforto e vista privilegiada',
          ordem: 3,
          ativo: true,
          active: true
        },
        {
          id: 'suite',
          nome: 'Suite Presidential',
          precosPorPeriodo: new Map([
            ['4h', 150],
            ['6h', 200],
            ['12h', 250],
            ['diaria', 300],
            ['pernoite', 250]
          ]),
          disponibilidadePorPeriodo: new Map([
            ['4h', { hoje: true, agendado: false, availableFor: ['today'] }],
            ['6h', { hoje: true, agendado: false, availableFor: ['today'] }],
            ['12h', { hoje: true, agendado: false, availableFor: ['today'] }],
            ['diaria', { hoje: true, agendado: true, availableFor: ['today', 'future'] }],
            ['pernoite', { hoje: false, agendado: true, availableFor: ['future'] }]
          ]),
          periodosHoje: ['4h', '6h', '12h', 'diaria'],
          periodosAgendado: ['diaria', 'pernoite'],
          configuracao: {
            capacidadeMaxima: 4,
            metrosQuadrados: 60,
            vista: 'panoramica'
          },
          amenidades: ['wifi', 'ar_condicionado', 'tv', 'frigobar', 'netflix', 'hidromassagem', 'som_bluetooth', 'varanda', 'luzes_led'],
          descricao: 'Suite presidencial com todos os luxos e vista panorâmica',
          ordem: 4,
          ativo: true,
          active: true
        }
      ];
      
      // ✅ CRIAR UM POR VEZ PARA EVITAR PROBLEMAS
      const tiposCriados = [];
      for (const tipoData of tiposParaCriar) {
        try {
          const tipo = new this(tipoData);
          const tipoSalvo = await tipo.save();
          tiposCriados.push(tipoSalvo);
          console.log(`✅ Tipo "${tipo.nome}" criado com sucesso`);
        } catch (erro) {
          console.error(`❌ Erro ao criar tipo "${tipoData.nome}":`, erro.message);
        }
      }
      
      console.log(`✅ ${tiposCriados.length} tipos criados com sucesso`);
      return tiposCriados;
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
roomTypeSchema.index({ ativo: 1, ordem: 1 });
roomTypeSchema.index({ active: 1, order: 1 });
roomTypeSchema.index({ 'disponibilidade.ativo': 1, ordem: 1 });
roomTypeSchema.index({ periodosHoje: 1 });
roomTypeSchema.index({ periodosAgendado: 1 });
roomTypeSchema.index({ nome: 1 });

module.exports = mongoose.models.RoomType || mongoose.model('RoomType', roomTypeSchema);
