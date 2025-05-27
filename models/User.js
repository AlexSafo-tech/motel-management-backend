// models/User.js - Modelo de usuário do sistema ATUALIZADO
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
    enum: ['admin', 'recepcionista', 'camareira', 'cozinha'],
    default: 'recepcionista'
  },
  
  // ✅ CAMPOS ATUALIZADOS PARA COMPATIBILIDADE
  isActive: {
    type: Boolean,
    default: true
  },
  ativo: {
    type: Boolean,
    default: true
  },
  
  lastLogin: {
    type: Date
  },
  ultimoLogin: {
    type: Date
  },
  
  // ✅ NOVOS CAMPOS PARA SEGURANÇA
  tentativasLogin: {
    type: Number,
    default: 0
  },
  bloqueadoAte: Date,
  refreshTokens: [String],
  
  // ✅ NOVOS CAMPOS PARA AUDITORIA
  criadoPor: String,
  avatar: String,
  telefone: String,
  observacoes: String,
  
  // ✅ PERMISSÕES ORIGINAIS (MANTIDAS)
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

// ✅ MIDDLEWARE ATUALIZADO
userSchema.pre('save', async function(next) {
  // Sincronizar campos duplicados
  if (this.isModified('isActive')) {
    this.ativo = this.isActive;
  }
  if (this.isModified('ativo')) {
    this.isActive = this.ativo;
  }
  if (this.isModified('lastLogin')) {
    this.ultimoLogin = this.lastLogin;
  }
  if (this.isModified('ultimoLogin')) {
    this.lastLogin = this.ultimoLogin;
  }
  
  // Hash da senha
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// ✅ MÉTODO EXISTENTE (MANTIDO)
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ✅ MÉTODO ATUALIZADO PARA JSON
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.refreshTokens;
  return userObject;
};

// ✅ NOVOS MÉTODOS ÚTEIS
userSchema.methods.isBlocked = function() {
  return this.bloqueadoAte && this.bloqueadoAte > new Date();
};

userSchema.methods.resetLoginAttempts = function() {
  this.tentativasLogin = 0;
  this.bloqueadoAte = null;
};

userSchema.methods.incrementLoginAttempts = function() {
  this.tentativasLogin += 1;
  
  // Bloquear após 5 tentativas por 15 minutos
  if (this.tentativasLogin >= 5) {
    this.bloqueadoAte = new Date(Date.now() + 15 * 60 * 1000);
  }
};

// ✅ INDEXES PARA PERFORMANCE
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ ativo: 1 });
userSchema.index({ createdAt: -1 });

module.exports = mongoose.model('User', userSchema);
