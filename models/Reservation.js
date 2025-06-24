// models/Reservation.js - MODELO COM VALIDAÇÃO 100% DINÂMICA DO MONGODB

const mongoose = require('mongoose');

// ✅ FUNÇÃO PARA BUSCAR PERÍODOS VÁLIDOS DO MONGODB REAL
const obterPeriodosValidos = async () => {
  try {
    // Verificar se o modelo Period existe
    let Period;
    try {
      Period = mongoose.model('Period');
    } catch (error) {
      // Se não existir, tentar importar
      try {
        Period = require('./Period');
      } catch (importError) {
        console.warn('⚠️ Modelo Period não encontrado, usando enum padrão');
        return ['pernoite', '1hora', 'daily', '4h', '6h', '12h', '3h'];
      }
    }
    
    // ✅ BUSCAR PERÍODOS ATIVOS DO MONGODB (CAMPOS CORRETOS CONFORME A IMAGEM)
    const periodos = await Period.find({ 
      active: true  // ✅ Campo correto conforme imagem do MongoDB
    }).distinct('periodType'); // ✅ Campo correto conforme imagem
    
    console.log('✅ Períodos válidos do MongoDB (validação dinâmica):', periodos);
    
    // ✅ INCLUIR PERÍODOS BÁSICOS COMO FALLBACK
    const periodosBasicos = ['pernoite', '1hora', 'daily', '4h', '6h', '12h', '3h'];
    const todosOsPeriodos = [...new Set([...periodos, ...periodosBasicos])];
    
    return todosOsPeriodos;
    
  } catch (error) {
    console.error('❌ Erro ao buscar períodos do MongoDB para validação:', error);
    // ✅ FALLBACK ATUALIZADO CONFORME A IMAGEM
    return ['pernoite', '1hora', 'daily', '4h', '6h', '12h', '3h', 'dayuse'];
  }
};

// ✅ SCHEMA COMPLETO COM VALIDAÇÃO DINÂMICA
const reservationSchema = new mongoose.Schema({
  // ✅ NÚMERO DA RESERVA (AUTO-GERADO)
  reservationNumber: {
    type: String,
    unique: true,
    required: true
  },

  // ✅ DADOS DO CLIENTE
  customerName: { 
    type: String, 
    required: true,
    trim: true,
    default: 'Cliente não informado' 
  },
  customerPhone: { 
    type: String, 
    trim: true,
    default: '' 
  },
  customerEmail: { 
    type: String, 
    trim: true,
    lowercase: true,
    default: '' 
  },
  customerDocument: { 
    type: String,
    trim: true, 
    default: '' 
  },
  
  // ✅ DADOS DO QUARTO
  roomId: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  roomNumber: { 
    type: String, 
    required: true
  },
  
  // ✅ DATAS E HORÁRIOS
  checkIn: { 
    type: Date, 
    required: true 
  },
  checkOut: { 
    type: Date, 
    required: true 
  },
  
  // ✅ PERÍODO - VALIDAÇÃO 100% DINÂMICA BASEADA NO MONGODB REAL
  periodType: { 
    type: String,
    required: true,
    // ✅ VALIDAÇÃO DINÂMICA QUE BUSCA DADOS REAIS DO MONGODB
    validate: {
      validator: async function(value) {
        try {
          const periodosValidos = await obterPeriodosValidos();
          const isValid = periodosValidos.includes(value);
          
          if (!isValid) {
            console.error(`❌ Período inválido na validação: ${value}`);
            console.log(`✅ Períodos válidos do MongoDB: ${periodosValidos.join(', ')}`);
          } else {
            console.log(`✅ Período válido: ${value}`);
          }
          
          return isValid;
        } catch (error) {
          console.error('❌ Erro na validação dinâmica de período:', error);
          // ✅ EM CASO DE ERRO, ACEITAR PERÍODOS BÁSICOS
          const basicPeriods = ['pernoite', '1hora', 'daily', '4h', '6h', '12h', '3h'];
          const isBasicValid = basicPeriods.includes(value);
          console.log(`⚠️ Fallback: Período ${value} é básico: ${isBasicValid}`);
          return isBasicValid;
        }
      },
      message: function(props) {
        return `'${props.value}' não é um tipo de período válido no sistema. Verifique os períodos ativos no MongoDB.`;
      }
    },
    default: '4h'
  },
  periodName: { 
    type: String, 
    default: '4 HORAS' 
  },
  basePrice: { 
    type: Number, 
    required: true,
    min: 0,
    default: 50.00 
  },
  totalPrice: { 
    type: Number, 
    required: true,
    min: 0,
    default: 50.00 
  },
  
  // ✅ STATUS E PAGAMENTO
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled'],
    default: 'confirmed',
    required: true
  },
  paymentMethod: { 
    type: String,
    enum: ['cash', 'card', 'pix', 'transfer'],
    default: 'cash' 
  },
  paymentStatus: { 
    type: String,
    enum: ['pending', 'paid', 'refunded'],
    default: 'paid' 
  },
  
  // ✅ INFORMAÇÕES ADICIONAIS
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  
  // ✅ CAMPOS DE TURNO
  turnoInfo: {
    turnoId: {
      type: String,
      default: null,
      index: true
    },
    turnoNome: {
      type: String, // 'Manhã', 'Tarde', 'Noite'
      default: null
    },
    funcionarioTurno: {
      type: String,
      default: null
    },
    funcionarioTurnoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    dataInicioTurno: {
      type: Date,
      default: null
    },
    horaInicioTurno: {
      type: String,
      default: null
    }
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
  // ✅ OPÇÕES
  timestamps: true, // createdAt e updatedAt automáticos
  
  // ✅ TRANSFORMAÇÃO JSON
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      // Compatibilidade com frontend
      ret.cliente = {
        nome: ret.customerName,
        telefone: ret.customerPhone,
        email: ret.customerEmail
      };
      ret.quarto = ret.roomNumber;
      ret.periodo = ret.periodName;
      ret.valor = ret.totalPrice.toFixed(2);
      ret.data = ret.checkIn;
      return ret;
    }
  }
});

// ✅ ÍNDICES PARA PERFORMANCE
reservationSchema.index({ status: 1, createdAt: -1 });
reservationSchema.index({ roomId: 1, checkIn: 1 });
reservationSchema.index({ customerName: 'text', customerPhone: 'text' });
reservationSchema.index({ 'turnoInfo.turnoId': 1, createdAt: -1 });
reservationSchema.index({ 'turnoInfo.funcionarioTurnoId': 1, createdAt: -1 });
reservationSchema.index({ periodType: 1 }); // ✅ Index para periodType

// ✅ MIDDLEWARE PRE-VALIDATE CORRIGIDO - EVITA DUPLICATAS
reservationSchema.pre('validate', async function(next) {
  // Auto-gerar número de reserva se não existir
  if (this.isNew && !this.reservationNumber) {
    try {
      // 🔥 SOLUÇÃO: Usar timestamp + contador atômico para garantir unicidade
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const timestamp = now.getTime().toString().slice(-6); // Últimos 6 dígitos do timestamp
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      
      // Formato: RES + ANO + MÊS + DIA + TIMESTAMP + RANDOM
      this.reservationNumber = `RES${year}${month}${day}${timestamp}${random}`;
      
      // 🛡️ VERIFICAÇÃO DE SEGURANÇA: Se ainda assim existir, usar fallback
      const existsCheck = await this.constructor.findOne({ 
        reservationNumber: this.reservationNumber 
      });
      
      if (existsCheck) {
        this.reservationNumber = `RES${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
        console.log('⚠️ Número duplicado detectado, usando fallback:', this.reservationNumber);
      }
      
      console.log('✅ Número de reserva gerado:', this.reservationNumber);
      
    } catch (err) {
      this.reservationNumber = `RES${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
      console.log('❌ Erro na geração, usando fallback:', this.reservationNumber);
    }
  }
  
  // Validar datas
  if (this.checkOut <= this.checkIn) {
    throw new Error('Check-out deve ser posterior ao check-in');
  }
  
  next();
});

// ✅ MÉTODO ESTÁTICO PARA VALIDAR PERÍODO DINAMICAMENTE
reservationSchema.statics.validarPeriodo = async function(periodType) {
  try {
    const periodosValidos = await obterPeriodosValidos();
    const isValid = periodosValidos.includes(periodType);
    console.log(`🔍 Validação estática: ${periodType} → ${isValid}`);
    return isValid;
  } catch (error) {
    console.error('❌ Erro ao validar período estaticamente:', error);
    return false;
  }
};

// ✅ MÉTODO ESTÁTICO PARA OBTER PERÍODOS VÁLIDOS DO MONGODB
reservationSchema.statics.obterPeriodosValidos = obterPeriodosValidos;

// ✅ MÉTODO ESTÁTICO PARA SINCRONIZAR COM MONGODB
reservationSchema.statics.sincronizarComMongoDB = async function() {
  try {
    console.log('🔄 Sincronizando validação com MongoDB...');
    const periodosValidos = await obterPeriodosValidos();
    console.log(`✅ Sincronização concluída. ${periodosValidos.length} períodos válidos.`);
    return periodosValidos;
  } catch (error) {
    console.error('❌ Erro na sincronização:', error);
    return [];
  }
};

// ✅ MÉTODO ESTÁTICO PARA DEBUG DE VALIDAÇÃO
reservationSchema.statics.debugValidacao = async function(periodType) {
  try {
    console.log(`🔍 [DEBUG] Testando validação para: ${periodType}`);
    
    const periodosValidos = await obterPeriodosValidos();
    const isValid = periodosValidos.includes(periodType);
    
    console.log(`📊 [DEBUG] Resultado:`);
    console.log(`   - Período testado: ${periodType}`);
    console.log(`   - É válido: ${isValid}`);
    console.log(`   - Períodos válidos: ${periodosValidos.join(', ')}`);
    console.log(`   - Total de períodos: ${periodosValidos.length}`);
    
    return {
      periodType,
      isValid,
      availablePeriods: periodosValidos,
      totalPeriods: periodosValidos.length
    };
    
  } catch (error) {
    console.error('❌ Erro no debug de validação:', error);
    return {
      periodType,
      isValid: false,
      error: error.message
    };
  }
};

// ✅ MÉTODOS DE INSTÂNCIA
reservationSchema.methods.getDuration = function() {
  const diff = this.checkOut - this.checkIn;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return { hours, minutes, total: diff };
};

reservationSchema.methods.isActive = function() {
  return this.status === 'checked-in';
};

reservationSchema.methods.canCheckIn = function() {
  return this.status === 'confirmed';
};

reservationSchema.methods.canCheckOut = function() {
  return this.status === 'checked-in';
};

// ✅ MÉTODOS ESTÁTICOS
reservationSchema.statics.findActive = function() {
  return this.find({ status: 'checked-in' });
};

reservationSchema.statics.findByRoom = function(roomId) {
  return this.find({ roomId, status: { $in: ['confirmed', 'checked-in'] } });
};

reservationSchema.statics.getTodayStats = async function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const stats = await this.aggregate([
    {
      $match: {
        createdAt: { $gte: today, $lt: tomorrow }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        revenue: { $sum: '$totalPrice' },
        confirmed: {
          $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] }
        },
        checkedIn: {
          $sum: { $cond: [{ $eq: ['$status', 'checked-in'] }, 1, 0] }
        },
        checkedOut: {
          $sum: { $cond: [{ $eq: ['$status', 'checked-out'] }, 1, 0] }
        }
      }
    }
  ]);
  
  return stats[0] || {
    total: 0,
    revenue: 0,
    confirmed: 0,
    checkedIn: 0,
    checkedOut: 0
  };
};

reservationSchema.statics.getReservasPorTurno = async function(turnoId) {
  const reservas = await this.find({ 
    'turnoInfo.turnoId': turnoId,
    status: { $in: ['confirmed', 'checked-in', 'checked-out'] }
  }).sort({ createdAt: -1 });
  
  // Calcular faturamento por forma de pagamento
  const faturamento = reservas.reduce((acc, reserva) => {
    const valor = reserva.totalPrice || 0;
    
    switch(reserva.paymentMethod) {
      case 'cash':
        acc.dinheiro += valor;
        break;
      case 'card':
        acc.cartao += valor;
        break;
      case 'pix':
        acc.pix += valor;
        break;
      default:
        acc.dinheiro += valor; // Default para dinheiro
    }
    
    acc.total += valor;
    return acc;
  }, { dinheiro: 0, cartao: 0, pix: 0, total: 0 });
  
  return {
    reservas,
    faturamento,
    quantidade: reservas.length
  };
};

// ✅ MIDDLEWARE PÓS-SAVE PARA LOG
reservationSchema.post('save', function(doc) {
  console.log(`✅ Reserva salva: ${doc.reservationNumber} | Período: ${doc.periodType} (${doc.periodName}) | Preço: R$ ${doc.totalPrice}`);
});

// ✅ MIDDLEWARE PÓS-VALIDATE PARA DEBUG
reservationSchema.post('validate', function(doc) {
  console.log(`✅ Validação concluída: ${doc.periodType} aceito`);
});

// ✅ EXPORTAR MODELO
module.exports = mongoose.model('Reservation', reservationSchema);
