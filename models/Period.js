// models/Period.js - MODELO CORRIGIDO PARA ESTRUTURA REAL DO MONGODB

const mongoose = require('mongoose');

// ✅ SCHEMA BASEADO NA ESTRUTURA REAL VISTA NA IMAGEM DO MONGODB
const periodSchema = new mongoose.Schema({
  // ✅ CAMPOS CONFORME MONGODB REAL
  periodType: {
    type: String,
    required: [true, 'Tipo do período é obrigatório'],
    unique: true,
    trim: true,
    lowercase: true,
    index: true
  },

  periodName: {
    type: String,
    required: [true, 'Nome do período é obrigatório'],
    trim: true,
    uppercase: true,
    maxlength: [50, 'Nome não pode ter mais de 50 caracteres']
  },

  // ✅ PREÇO BASE (CONFORME IMAGEM DO MONGODB)
  basePrice: {
    type: Number,
    required: [true, 'Preço base é obrigatório'],
    min: [0, 'Preço não pode ser negativo'],
    default: 50.00
  },

  // ✅ DESCRIÇÃO
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Descrição não pode ter mais de 200 caracteres']
  },

  // ✅ STATUS ATIVO (CONFORME IMAGEM)
  active: {
    type: Boolean,
    default: true,
    required: true,
    index: true
  },

  // ✅ ORDEM DE EXIBIÇÃO
  order: {
    type: Number,
    default: 0,
    min: [0, 'Ordem não pode ser negativa']
  },

  // ✅ CATEGORIA DO PERÍODO
  category: {
    type: String,
    enum: ['hourly', 'overnight', 'daily', 'dayuse'],
    default: 'hourly'
  },

  // ✅ DISPONIBILIDADE PARA TIPOS DE RESERVA
  availableFor: {
    type: [String],
    default: ['all'],
    validate: {
      validator: function(v) {
        return Array.isArray(v) && v.length > 0;
      },
      message: 'Deve ter pelo menos um tipo de disponibilidade'
    }
  },

  // ✅ HORÁRIOS (PARA PERÍODOS ESPECIAIS)
  checkInTime: {
    type: String,
    validate: {
      validator: function(v) {
        if (!v) return true; // Opcional
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Horário de check-in deve estar no formato HH:MM (24h)'
    }
  },

  checkOutTime: {
    type: String,
    validate: {
      validator: function(v) {
        if (!v) return true; // Opcional
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Horário de check-out deve estar no formato HH:MM (24h)'
    }
  },

  // ✅ DURAÇÃO EM HORAS (PARA PERÍODOS POR HORA)
  durationHours: {
    type: Number,
    min: [0.5, 'Duração deve ser pelo menos 30 minutos'],
    max: [48, 'Duração não pode passar de 48 horas'],
    validate: {
      validator: function(v) {
        // Obrigatório apenas para categoria 'hourly'
        return this.category !== 'hourly' || (v && v > 0);
      },
      message: 'Duração em horas é obrigatória para períodos por hora'
    }
  },

  // ✅ CONFIGURAÇÕES DE PREÇO
  isFixedPrice: {
    type: Boolean,
    default: true
  },

  isFeedbackPeriod: {
    type: Boolean,
    default: true
  },

  // ✅ AUDITORIA
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
      ret.id = ret.periodType; // Usar periodType como ID
      return ret;
    }
  }
});

// ✅ MIDDLEWARE PRE-SAVE
periodSchema.pre('save', function(next) {
  // Validações personalizadas
  if (this.category === 'overnight' && (!this.checkInTime || !this.checkOutTime)) {
    return next(new Error('Períodos de pernoite devem ter horários de check-in e check-out'));
  }
  
  if (this.category === 'daily' && (!this.checkInTime || !this.checkOutTime)) {
    return next(new Error('Períodos de diária devem ter horários de check-in e check-out'));
  }
  
  // Para períodos por hora, duração é obrigatória
  if (this.category === 'hourly' && !this.durationHours) {
    return next(new Error('Períodos por hora devem ter duração definida'));
  }
  
  next();
});

// ✅ MÉTODOS ESTÁTICOS
periodSchema.statics.findAtivos = function() {
  return this.find({ active: true }).sort({ order: 1, periodName: 1 });
};

periodSchema.statics.findPorCategoria = function(categoria) {
  return this.find({ category: categoria, active: true }).sort({ order: 1 });
};

periodSchema.statics.buscarPorTipo = function(periodType) {
  return this.findOne({ periodType: periodType });
};

// ✅ MÉTODO PARA OBTER MAPEAMENTO COMPLETO
periodSchema.statics.obterMapeamentoCompleto = async function() {
  try {
    const periodos = await this.find({ active: true }).sort({ order: 1 });
    
    const mapeamento = {
      nomes: {},
      precos: {},
      tipos: [],
      completo: {}
    };
    
    periodos.forEach(periodo => {
      const tipo = periodo.periodType;
      
      mapeamento.nomes[tipo] = periodo.periodName;
      mapeamento.precos[tipo] = periodo.basePrice;
      mapeamento.tipos.push(tipo);
      mapeamento.completo[tipo] = {
        nome: periodo.periodName,
        preco: periodo.basePrice,
        categoria: periodo.category,
        descricao: periodo.description,
        ordem: periodo.order
      };
    });
    
    return mapeamento;
    
  } catch (error) {
    console.error('❌ Erro ao obter mapeamento:', error);
    return {
      nomes: {},
      precos: {},
      tipos: [],
      completo: {}
    };
  }
};

// ✅ CRIAR PERÍODOS PADRÃO CONFORME ESTRUTURA DO MONGODB
periodSchema.statics.criarPeriodosPadrao = async function() {
  try {
    const count = await this.countDocuments();
    
    if (count === 0) {
      console.log('⏰ Criando períodos padrão conforme MongoDB...');
      
      const periodsPadrao = [
        {
          periodType: '1hora',
          periodName: '1 HORA',
          basePrice: 50,
          description: 'Período de 1 HORA',
          category: 'hourly',
          durationHours: 1,
          active: true,
          order: 1,
          availableFor: ['all'],
          isFixedPrice: true,
          isFeedbackPeriod: true
        },
        {
          periodType: '4h',
          periodName: '4 HORAS',
          basePrice: 55,
          description: 'Período de 4 horas corridas',
          category: 'hourly',
          durationHours: 4,
          active: true,
          order: 2,
          availableFor: ['all'],
          isFixedPrice: true,
          isFeedbackPeriod: true
        },
        {
          periodType: '6h',
          periodName: '6 HORAS',
          basePrice: 70,
          description: 'Período de 6 horas corridas',
          category: 'hourly',
          durationHours: 6,
          active: true,
          order: 3,
          availableFor: ['all'],
          isFixedPrice: true,
          isFeedbackPeriod: true
        },
        {
          periodType: '12h',
          periodName: '12 HORAS',
          basePrice: 90,
          description: 'Período de 12 horas corridas',
          category: 'hourly',
          durationHours: 12,
          active: true,
          order: 4,
          availableFor: ['all'],
          isFixedPrice: true,
          isFeedbackPeriod: true
        },
        {
          periodType: 'pernoite',
          periodName: 'PERNOITE',
          basePrice: 100,
          description: 'Pernoite - Checkout às 12h',
          category: 'overnight',
          checkInTime: '20:00',
          checkOutTime: '12:00',
          active: true,
          order: 6,
          availableFor: ['all'],
          isFixedPrice: true,
          isFeedbackPeriod: true
        },
        {
          periodType: 'daily',
          periodName: 'DIÁRIA',
          basePrice: 120,
          description: 'Período de DIÁRIA',
          category: 'daily',
          checkInTime: '14:00',
          checkOutTime: '12:00',
          active: true,
          order: 7,
          availableFor: ['all'],
          isFixedPrice: true,
          isFeedbackPeriod: true
        }
      ];
      
      const periodosInseridos = await this.insertMany(periodsPadrao);
      console.log(`✅ ${periodosInseridos.length} períodos padrão criados com sucesso`);
      return periodosInseridos;
    } else {
      console.log(`✅ ${count} períodos já existem no banco`);
      return await this.findAtivos();
    }
  } catch (error) {
    console.error('❌ Erro ao criar períodos padrão:', error);
    throw error;
  }
};

// ✅ MÉTODO PARA ATIVAR/DESATIVAR PERÍODO
periodSchema.statics.alterarStatus = async function(periodType, ativo) {
  try {
    const resultado = await this.findOneAndUpdate(
      { periodType: periodType },
      { active: ativo, updatedAt: new Date() },
      { new: true }
    );
    
    if (resultado) {
      console.log(`✅ Período ${periodType} → ${ativo ? 'ATIVADO' : 'DESATIVADO'}`);
      return resultado;
    } else {
      console.error(`❌ Período ${periodType} não encontrado`);
      return null;
    }
  } catch (error) {
    console.error('❌ Erro ao alterar status do período:', error);
    return null;
  }
};

// ✅ MÉTODO PARA DEBUG
periodSchema.statics.debugPeriodos = async function() {
  try {
    const todosPeriodos = await this.find({});
    const periodosAtivos = await this.find({ active: true });
    
    console.log('🔍 === DEBUG PERÍODOS ===');
    console.log(`📊 Total no banco: ${todosPeriodos.length}`);
    console.log(`📊 Ativos: ${periodosAtivos.length}`);
    
    todosPeriodos.forEach(p => {
      console.log(`📋 ${p.periodType} → ${p.periodName} | R$ ${p.basePrice} | Ativo: ${p.active}`);
    });
    
    return {
      total: todosPeriodos.length,
      ativos: periodosAtivos.length,
      todos: todosPeriodos,
      apenasAtivos: periodosAtivos
    };
  } catch (error) {
    console.error('❌ Erro no debug:', error);
    return { error: error.message };
  }
};

// ✅ ÍNDICES PARA PERFORMANCE
periodSchema.index({ periodType: 1 }, { unique: true });
periodSchema.index({ active: 1, order: 1 });
periodSchema.index({ category: 1, active: 1 });

// ✅ MIDDLEWARE POST-SAVE PARA LOG
periodSchema.post('save', function(doc) {
  console.log(`✅ Período salvo: ${doc.periodType} → ${doc.periodName} | R$ ${doc.basePrice} | Ativo: ${doc.active}`);
});

module.exports = mongoose.models.Period || mongoose.model('Period', periodSchema);
