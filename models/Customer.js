// models/Customer.js - Modelo de cliente do motel

const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Nome é obrigatório'],
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    sparse: true, // Permite múltiplos documentos com email null/undefined
    validate: {
      validator: function(v) {
        return !v || /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
      },
      message: 'Email deve ter formato válido'
    }
  },
  phone: {
    type: String,
    required: [true, 'Telefone é obrigatório'],
    trim: true
  },
  document: {
    type: String,
    trim: true,
    sparse: true
  },
  documentType: {
    type: String,
    enum: ['CPF', 'RG', 'CNH', 'Passaporte', 'Outro'],
    default: 'CPF'
  },
  address: {
    street: { type: String, trim: true },
    number: { type: String, trim: true },
    complement: { type: String, trim: true },
    neighborhood: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, default: 'Brasil', trim: true },
    postalCode: { type: String, trim: true }
  },
  birthDate: {
    type: Date
  },
  gender: {
    type: String,
    enum: ['M', 'F', 'Outro', 'Não informado'],
    default: 'Não informado'
  },
  preferences: {
    favoriteRoomType: { type: String },
    favoriteFood: [{ type: String }],
    favoriteDrinks: [{ type: String }],
    specialRequests: { type: String, trim: true },
    observations: { type: String, trim: true }
  },
  stats: {
    totalVisits: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    lastVisit: { type: Date },
    averageStay: { type: Number, default: 0 }, // em horas
    favoriteRoom: { type: String }
  },
  loyalty: {
    points: { type: Number, default: 0 },
    level: { 
      type: String, 
      enum: ['Bronze', 'Prata', 'Ouro', 'Platina'],
      default: 'Bronze'
    },
    discountPercentage: { type: Number, default: 0 }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVip: {
    type: Boolean,
    default: false
  },
  notes: {
    type: String,
    trim: true
  },
  emergencyContact: {
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    relationship: { type: String, trim: true }
  }
}, {
  timestamps: true
});

// Índices para melhor performance
customerSchema.index({ phone: 1 });
customerSchema.index({ email: 1 });
customerSchema.index({ document: 1 });
customerSchema.index({ name: 'text', phone: 'text' });

// Virtual para nome completo da cidade
customerSchema.virtual('fullAddress').get(function() {
  const addr = this.address;
  if (!addr.street) return '';
  
  let fullAddr = addr.street;
  if (addr.number) fullAddr += `, ${addr.number}`;
  if (addr.complement) fullAddr += `, ${addr.complement}`;
  if (addr.neighborhood) fullAddr += ` - ${addr.neighborhood}`;
  if (addr.city) fullAddr += `, ${addr.city}`;
  if (addr.state) fullAddr += `/${addr.state}`;
  if (addr.postalCode) fullAddr += ` - ${addr.postalCode}`;
  
  return fullAddr;
});

// Virtual para idade
customerSchema.virtual('age').get(function() {
  if (!this.birthDate) return null;
  
  const today = new Date();
  const birth = new Date(this.birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
});

// Método para adicionar pontos de fidelidade
customerSchema.methods.addLoyaltyPoints = function(amount) {
  const pointsToAdd = Math.floor(amount / 10); // 1 ponto a cada R$ 10 gastos
  this.loyalty.points += pointsToAdd;
  
  // Atualizar nível baseado nos pontos
  if (this.loyalty.points >= 1000) {
    this.loyalty.level = 'Platina';
    this.loyalty.discountPercentage = 15;
  } else if (this.loyalty.points >= 500) {
    this.loyalty.level = 'Ouro';
    this.loyalty.discountPercentage = 10;
  } else if (this.loyalty.points >= 200) {
    this.loyalty.level = 'Prata';
    this.loyalty.discountPercentage = 5;
  } else {
    this.loyalty.level = 'Bronze';
    this.loyalty.discountPercentage = 0;
  }
  
  return this.save();
};

// Método para atualizar estatísticas
customerSchema.methods.updateStats = function(visitData) {
  this.stats.totalVisits += 1;
  this.stats.totalSpent += visitData.amountSpent || 0;
  this.stats.lastVisit = new Date();
  
  if (visitData.stayDuration) {
    // Calcular média de permanência
    const currentAvg = this.stats.averageStay || 0;
    const totalStays = this.stats.totalVisits;
    this.stats.averageStay = ((currentAvg * (totalStays - 1)) + visitData.stayDuration) / totalStays;
  }
  
  if (visitData.roomNumber) {
    this.stats.favoriteRoom = visitData.roomNumber;
  }
  
  // Adicionar pontos de fidelidade
  if (visitData.amountSpent) {
    this.addLoyaltyPoints(visitData.amountSpent);
  }
  
  return this.save();
};

module.exports = mongoose.model('Customer', customerSchema);
