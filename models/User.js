// models/User.js - Modelo de usuário do sistema

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Nome é obrigatório'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email é obrigatório'],
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Senha é obrigatória'],
    minlength: 6
  },
  role: {
    type: String,
    enum: ['admin', 'manager', 'receptionist', 'kitchen'],
    default: 'receptionist'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  permissions: {
    canManageUsers: { type: Boolean, default: false },
    canManageRooms: { type: Boolean, default: true },
    canManageReservations: { type: Boolean, default: true },
    canManageOrders: { type: Boolean, default: true },
    canManageInventory: { type: Boolean, default: false },
    canViewReports: { type: Boolean, default: false }
  }
}, {
  timestamps: true
});

// Middleware para criptografar senha antes de salvar
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Método para comparar senha
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Método para converter para JSON (removendo senha)
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

module.exports = mongoose.model('User', userSchema);
