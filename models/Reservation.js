// models/Reservation.js - MODELO SEPARADO E CORRIGIDO
const mongoose = require('mongoose');

// ✅ SCHEMA COMPLETO E ROBUSTO
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
  
  // ✅ PERÍODO E VALORES
  periodType: { 
    type: String,
    enum: ['3h', '4h', '6h', '12h', 'daily', 'pernoite'],
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

// ✅ MIDDLEWARE PRE-SAVE
reservationSchema.pre('save', async function(next) {
  // Auto-gerar número de reserva se não existir
  if (this.isNew && !this.reservationNumber) {
    try {
      const count = await this.constructor.countDocuments();
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      this.reservationNumber = `RES${year}${month}${String(count + 1).padStart(4, '0')}`;
    } catch (err) {
      // Fallback caso falhe
      this.reservationNumber = `RES${Date.now()}`;
    }
  }
  
  // Validar datas
  if (this.checkOut <= this.checkIn) {
    throw new Error('Check-out deve ser posterior ao check-in');
  }
  
  next();
});

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

// ✅ EXPORTAR MODELO
module.exports = mongoose.model('Reservation', reservationSchema);
