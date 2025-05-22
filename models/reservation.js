// models/Reservation.js - Modelo de reserva do motel

const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  reservationNumber: {
    type: String,
    unique: true,
    required: true
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: [true, 'Quarto é obrigatório']
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: [true, 'Cliente é obrigatório']
  },
  checkIn: {
    type: Date,
    required: [true, 'Data/hora de entrada é obrigatória']
  },
  checkOut: {
    type: Date,
    required: [true, 'Data/hora de saída é obrigatória']
  },
  actualCheckIn: {
    type: Date
  },
  actualCheckOut: {
    type: Date
  },
  periodType: {
    type: String,
    enum: ['hourly', '4h', '12h', 'daily', 'custom'],
    required: true,
    default: '4h'
  },
  duration: {
    hours: { type: Number, required: true },
    minutes: { type: Number, default: 0 }
  },
  pricing: {
    basePrice: { type: Number, required: true },
    discountAmount: { type: Number, default: 0 },
    discountPercentage: { type: Number, default: 0 },
    extraCharges: { type: Number, default: 0 },
    totalPrice: { type: Number, required: true }
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled', 'no-show'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'partial', 'paid', 'refunded'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'credit_card', 'debit_card', 'pix', 'bank_transfer'],
    default: 'cash'
  },
  guests: {
    adults: { type: Number, default: 1, min: 1 },
    children: { type: Number, default: 0, min: 0 }
  },
  vehicleInfo: {
    licensePlate: { type: String, trim: true },
    model: { type: String, trim: true },
    color: { type: String, trim: true }
  },
  specialRequests: {
    type: String,
    trim: true
  },
  services: [{
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, default: 1 }
  }],
  consumptionTotal: {
    type: Number,
    default: 0
  },
  notes: {
    type: String,
    trim: true
  },
  cancelReason: {
    type: String,
    trim: true
  },
  cancelledAt: {
    type: Date
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  checkedInBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  checkedOutBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Middleware para gerar número da reserva
reservationSchema.pre('save', async function(next) {
  if (this.isNew && !this.reservationNumber) {
    const date = new Date();
    const year = date.getFullYear().toString().substr(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    // Buscar último número da reserva do dia
    const lastReservation = await this.constructor
      .findOne({
        reservationNumber: new RegExp(`^${year}${month}${day}`)
      })
      .sort({ reservationNumber: -1 });
    
    let sequence = 1;
    if (lastReservation) {
      const lastSequence = parseInt(lastReservation.reservationNumber.substr(-3));
      sequence = lastSequence + 1;
    }
    
    this.reservationNumber = `${year}${month}${day}${String(sequence).padStart(3, '0')}`;
  }
  next();
});

// Middleware para calcular preço total
reservationSchema.pre('save', function(next) {
  this.pricing.totalPrice = this.pricing.basePrice 
    - this.pricing.discountAmount 
    + this.pricing.extraCharges 
    + this.consumptionTotal;
  next();
});

// Índices para melhor performance
reservationSchema.index({ reservationNumber: 1 });
reservationSchema.index({ roomId: 1, checkIn: 1, checkOut: 1 });
reservationSchema.index({ customerId: 1 });
reservationSchema.index({ status: 1 });
reservationSchema.index({ checkIn: 1 });
reservationSchema.index({ checkOut: 1 });

// Virtual para duração total em horas
reservationSchema.virtual('totalHours').get(function() {
  if (!this.checkIn || !this.checkOut) return 0;
  return Math.ceil((this.checkOut - this.checkIn) / (1000 * 60 * 60));
});

// Virtual para verificar se está em andamento
reservationSchema.virtual('isActive').get(function() {
  return this.status === 'checked-in';
});

// Virtual para verificar se pode fazer check-in
reservationSchema.virtual('canCheckIn').get(function() {
  const now = new Date();
  const checkInTime = new Date(this.checkIn);
  const thirtyMinutesBefore = new Date(checkInTime.getTime() - 30 * 60 * 1000);
  
  return this.status === 'confirmed' && now >= thirtyMinutesBefore;
});

// Método para fazer check-in
reservationSchema.methods.doCheckIn = function(userId) {
  this.status = 'checked-in';
  this.actualCheckIn = new Date();
  this.checkedInBy = userId;
  return this.save();
};

// Método para fazer check-out
reservationSchema.methods.doCheckOut = function(userId, extraCharges = 0) {
  this.status = 'checked-out';
  this.actualCheckOut = new Date();
  this.checkedOutBy = userId;
  this.pricing.extraCharges += extraCharges;
  return this.save();
};

// Método para cancelar reserva
reservationSchema.methods.cancel = function(userId, reason = '') {
  this.status = 'cancelled';
  this.cancelledAt = new Date();
  this.cancelledBy = userId;
  this.cancelReason = reason;
  return this.save();
};

// Método para calcular tempo restante
reservationSchema.methods.getRemainingTime = function() {
  if (this.status !== 'checked-in') return null;
  
  const now = new Date();
  const checkOut = new Date(this.checkOut);
  const remaining = checkOut - now;
  
  if (remaining <= 0) return { hours: 0, minutes: 0, expired: true };
  
  return {
    hours: Math.floor(remaining / (1000 * 60 * 60)),
    minutes: Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60)),
    expired: false
  };
};

module.exports = mongoose.model('Reservation', reservationSchema);