// models/Period.js - MODELO DE PERÍODOS (estrutura de tempo)
const mongoose = require('mongoose');

const periodSchema = new mongoose.Schema({
  id: {
    type: String,
    required: [true, 'ID do período é obrigatório'],
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
    required: [true, 'Nome do período é obrigatório'],
    trim: true,
    maxlength: [50, 'Nome não pode ter mais de 50 caracteres']
  },

  // Tipo de período
  tipo: {
    type: String,
    enum: ['horario', 'pernoite', 'diaria'],
    required: true,
    default: 'horario'
  },

  // Para períodos por horário APENAS (4h, 6h, 12h)
  duracaoHoras: {
    type: Number,
    min: [1, 'Duração deve ser pelo menos 1 hora'],
    max: [24, 'Duração não pode passar de 24 horas'],
    validate: {
      validator: function(v) {
        // Obrigatório APENAS para tipo 'horario'
        // Para 'diaria' e 'pernoite' o que importa é check-in/check-out
        return this.tipo !== 'horario' || (v && v > 0);
      },
      message: 'Duração em horas é obrigatória apenas para períodos por horário'
    }
  },

  // Para períodos especiais (pernoite, diária)
  checkIn: {
    type: String, // Formato: "22:00"
    validate: {
      validator: function(v) {
        if (!v) return true; // Opcional
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Horário de check-in deve estar no formato HH:MM (24h)'
    }
  },

  checkOut: {
    type: String, // Formato: "12:00"  
    validate: {
      validator: function(v) {
        if (!v) return true; // Opcional
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Horário de check-out deve estar no formato HH:MM (24h)'
    }
  },

  // Configurações de disponibilidade
  disponibilidade: {
    hoje: { type: Boolean, default: true },
    agendado: { type: Boolean, default: true },
    fimDeSemana: { type: Boolean, default: true },
    feriado: { type: Boolean, default: true }
  },

  // Descrição e instruções
  descricao: {
    type: String,
    trim: true,
    maxlength: [200, 'Descrição não pode ter mais de 200 caracteres']
  },

  instrucoes: {
    type: String,
    trim: true,
    maxlength: [500, 'Instruções não podem ter mais de 500 caracteres']
  },

  // Controles
  ativo: {
    type: Boolean,
    default: true
  },

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
periodSchema.pre('save', function(next) {
  // Validações personalizadas
  if (this.tipo === 'pernoite' && (!this.checkIn || !this.checkOut)) {
    return next(new Error('Períodos de pernoite devem ter horários de check-in e check-out'));
  }
  
  if (this.tipo === 'diaria' && (!this.checkIn || !this.checkOut)) {
    return next(new Error('Períodos de diária devem ter horários de check-in e check-out'));
  }
  
  // Para períodos por horário, duração é obrigatória
  if (this.tipo === 'horario' && !this.duracaoHoras) {
    return next(new Error('Períodos por horário devem ter duração definida'));
  }
  
  next();
});

// ✅ MÉTODOS ESTÁTICOS
periodSchema.statics.findAtivos = function() {
  return this.find({ ativo: true }).sort({ ordem: 1, nome: 1 });
};

periodSchema.statics.findPorTipo = function(tipo) {
  return this.find({ tipo, ativo: true }).sort({ ordem: 1 });
};

// ✅ CRIAR PERÍODOS PADRÃO
periodSchema.statics.criarPeriodosPadrao = async function() {
  try {
    const count = await this.countDocuments();
    
    if (count === 0) {
      console.log('⏰ Criando períodos padrão...');
      
      const periodsPadrao = [
        {
          id: '4h',
          nome: '4 Horas',
          tipo: 'horario',
          duracaoHoras: 4,
          descricao: 'Período de 4 horas corridas',
          ordem: 1
        },
        {
          id: '6h',
          nome: '6 Horas', 
          tipo: 'horario',
          duracaoHoras: 6,
          descricao: 'Período de 6 horas corridas',
          ordem: 2
        },
        {
          id: '12h',
          nome: '12 Horas',
          tipo: 'horario', 
          duracaoHoras: 12,
          descricao: 'Período de 12 horas corridas',
          ordem: 3
        },
        {
          id: 'diaria',
          nome: 'Diária',
          tipo: 'diaria',
          // ❌ REMOVIDO: duracaoHoras (irrelevante para diária)
          checkIn: '14:00',
          checkOut: '12:00',
          descricao: 'Diária completa - check-in 14h, check-out 12h do dia seguinte',
          instrucoes: 'Check-in a partir das 14h. Check-out até 12h do dia seguinte.',
          ordem: 4
        },
        {
          id: 'pernoite',
          nome: 'Pernoite',
          tipo: 'pernoite',
          // ❌ REMOVIDO: duracaoHoras (irrelevante para pernoite)
          checkIn: '20:00',
          checkOut: '12:00', 
          descricao: 'Pernoite - check-in 20h, check-out 12h do dia seguinte',
          instrucoes: 'Check-in a partir das 20h. Check-out até 12h do dia seguinte.',
          ordem: 5
        }
      ];
      
      await this.insertMany(periodsPadrao);
      console.log('✅ Períodos padrão criados com sucesso');
      return periodsPadrao;
    } else {
      console.log('✅ Períodos já existem');
      return await this.findAtivos();
    }
  } catch (error) {
    console.error('❌ Erro ao criar períodos padrão:', error);
    throw error;
  }
};

// ✅ ÍNDICES
periodSchema.index({ id: 1 }, { unique: true });
periodSchema.index({ ativo: 1, ordem: 1 });
periodSchema.index({ tipo: 1 });

module.exports = mongoose.models.Period || mongoose.model('Period', periodSchema);
