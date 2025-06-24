// models/Reservation.js - CORREÇÃO MÍNIMA: SÓ REMOVER ENUM FIXO + VALIDAÇÃO DINÂMICA

const mongoose = require('mongoose');

// ✅ FUNÇÃO SIMPLES PARA VALIDAR PERÍODO (ADICIONADA)
const validarPeriodoNoMongo = async (periodType) => {
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
        console.warn('⚠️ Modelo Period não encontrado, aceitando período:', periodType);
        return true; // Aceitar se não conseguir validar
      }
    }
    
    // ✅ BUSCAR SE O PERÍODO EXISTE E ESTÁ ATIVO
    const periodo = await Period.findOne({ 
      periodType: periodType,
      active: true 
    });
    
    const isValid = !!periodo;
    console.log(`🔍 Validação período "${periodType}": ${isValid ? 'VÁLIDO' : 'INVÁLIDO'}`);
    
    return isValid;
    
  } catch (error) {
    console.error('❌ Erro ao validar período:', error);
    // Em caso de erro, aceitar o período (segurança)
    return true;
  }
};

// ✅ SCHEMA ORIGINAL MANTIDO - SÓ ALTERAÇÃO NO CAMPO periodType
const reservationSchema = new mongoose.Schema({
  // ✅ NÚMERO DA RESERVA (MANTIDO ORIGINAL)
  reservationNumber: {
    type: String,
    unique: true,
    required: true
  },

  // ✅ DADOS DO CLIENTE (MANTIDOS ORIGINAIS)
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
  
  // ✅ DADOS DO QUARTO (MANTIDOS ORIGINAIS)
  roomId: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  roomNumber: { 
    type: String, 
    required: true
  },
  
  // ✅ DATAS E HORÁRIOS (MANTIDOS ORIGINAIS)
  checkIn: { 
    type: Date, 
    required: true 
  },
  checkOut: { 
    type: Date, 
    required: true 
  },
  
  // ✅ ÚNICA ALTERAÇÃO: REMOVER ENUM FIXO, ADICIONAR VALIDAÇÃO DINÂMICA
  periodType: { 
    type: String,
    required: true,
    // ❌ REMOVIDO: enum: ['3h', '4h', '6h'...], // ← ENUM FIXO REMOVIDO
    // ✅ ADICIONADO: VALIDAÇÃO DINÂMICA
    validate: {
      validator: async function(value) {
        try {
          const isValid = await validarPeriodoNoMongo(value);
          if (!isValid) {
            console.error(`❌ Período "${value}" não está ativo no MongoDB`);
          }
          return isValid;
        } catch (error) {
          console.error('❌ Erro na validação de período:', error);
          // Em caso de erro, aceitar (segurança)
          return true;
        }
      },
      message: function(props) {
        return `Período '${props.value}' não está ativo no sistema. Verifique os períodos disponíveis.`;
      }
    },
    default: '4h'
  },
  
  // ✅ RESTO DOS CAMPOS MANTIDOS EXATAMENTE IGUAIS
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
  
  // ✅ STATUS E PAGAMENTO (MANTIDOS ORIGINAIS)
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
  
  // ✅ INFORMAÇÕES ADICIONAIS (MANTIDAS ORIGINAIS)
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  
  // ✅ CAMPOS DE TURNO (MANTIDOS ORIGINAIS)
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
  
  // ✅ AUDITORIA (MANTIDA ORIGINAL)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  // ✅ OPÇÕES (MANTIDAS ORIGINAIS)
  timestamps: true, // createdAt e updatedAt automáticos
  
  // ✅ TRANSFORMAÇÃO JSON (MANTIDA ORIGINAL)
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

// ✅ ÍNDICES PARA PERFORMANCE (MANTIDOS ORIGINAIS)
reservationSchema.index({ status: 1, createdAt: -1 });
reservationSchema.index({ roomId: 1, checkIn: 1 });
reservationSchema.index({ customerName: 'text', customerPhone: 'text' });
reservationSchema.index({ 'turnoInfo.turnoId': 1, createdAt: -1 });
reservationSchema.index({ 'turnoInfo.funcionarioTurnoId': 1, createdAt: -1 });
reservationSchema.index({ periodType: 1 });

// ✅ MIDDLEWARE PRE-VALIDATE (MANTIDO ORIGINAL)
reservationSchema.pre('validate', async function(next) {
  // Auto-gerar número de reserva se não existir
  if (this.isNew && !this.reservationNumber) {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const timestamp = now.getTime().toString().slice(-6);
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      
      this.reservationNumber = `RES${year}${month}${day}${timestamp}${random}`;
      
      // Verificação de segurança
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

// ✅ TODOS OS MÉTODOS ORIGINAIS MANTIDOS
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

// ✅ MÉTODOS ESTÁTICOS ORIGINAIS MANTIDOS
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

// ✅ ADICIONADO: MÉTODO PARA VALIDAR PERÍODO ESTATICAMENTE
reservationSchema.statics.validarPeriodo = async function(periodType) {
  return await validarPeriodoNoMongo(periodType);
};

// ✅ EXPORTAR MODELO (MANTIDO ORIGINAL)
module.exports = mongoose.model('Reservation', reservationSchema);
