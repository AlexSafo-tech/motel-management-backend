// models/Reservation.js - MODELO SEPARADO (EVITA CONFLITOS)

const mongoose = require('mongoose');

// ✅ DELETAR MODELO EXISTENTE SE HOUVER (EVITA OVERWRITE ERROR)
if (mongoose.models.Reservation) {
  delete mongoose.models.Reservation;
  console.log('🗑️ Modelo Reservation anterior removido');
}

// ✅ SCHEMA ULTRA SIMPLES
const reservationSchema = new mongoose.Schema({
  reservationNumber: {
    type: String,
    unique: true
  },
  // ✅ DADOS DO CLIENTE (inline, todos opcionais)
  customerName: { type: String, default: 'Cliente não informado' },
  customerPhone: { type: String, default: '' },
  customerEmail: { type: String, default: '' },
  customerDocument: { type: String, default: '' },
  
  // ✅ DADOS DO QUARTO (simples)
  roomId: { type: String, default: 'room-default' },
  roomNumber: { type: String, default: '101' },
  
  // ✅ DATAS (básicas)
  checkIn: { type: Date, required: true },
  checkOut: { type: Date, required: true },
  
  // ✅ PERÍODO E PREÇO (simples)
  periodType: { type: String, default: '4h' },
  periodName: { type: String, default: '4 HORAS' },
  basePrice: { type: Number, default: 50.00 },
  totalPrice: { type: Number, default: 50.00 },
  
  // ✅ STATUS E PAGAMENTO
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled'],
    default: 'confirmed'
  },
  paymentMethod: { type: String, default: 'cash' },
  paymentStatus: { type: String, default: 'paid' },
  
  // ✅ METADATA MÍNIMA
  notes: String,
  createdBy: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// ✅ AUTO-GERAR NÚMERO DE RESERVA
reservationSchema.pre('save', async function(next) {
  if (this.isNew && !this.reservationNumber) {
    try {
      const count = await this.constructor.countDocuments();
      this.reservationNumber = `RES${String(count + 1).padStart(4, '0')}`;
    } catch (err) {
      this.reservationNumber = `RES${Date.now()}`;
    }
  }
  next();
});

// ✅ CRIAR MODELO LIMPO
const Reservation = mongoose.model('Reservation', reservationSchema);

console.log('✅ Modelo Reservation criado com sucesso (arquivo separado)');

module.exports = Reservation;
