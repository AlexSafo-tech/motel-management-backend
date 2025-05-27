// models/UserLog.js - Modelo para logs de auditoria de usuários
const mongoose = require('mongoose');

const userLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  acao: {
    type: String,
    enum: [
      'login', 
      'logout', 
      'login_failed',
      'create_user', 
      'edit_user', 
      'delete_user',
      'change_role', 
      'change_status',
      'create_order', 
      'create_reservation',
      'create_product',
      'edit_product',
      'delete_product',
      'add_stock',
      'adjust_stock'
    ],
    required: true
  },
  detalhes: {
    type: String,
    required: true
  },
  ip: String,
  userAgent: String,
  timestamp: {
    type: Date,
    default: Date.now
  },
  
  // ✅ METADADOS EXTRAS PARA CONTEXTO
  metadados: {
    type: Object,
    default: {}
  },
  
  // ✅ INFORMAÇÕES DO USUÁRIO NO MOMENTO DA AÇÃO
  usuarioInfo: {
    nome: String,
    email: String,
    role: String
  },
  
  // ✅ RESULTADO DA AÇÃO
  sucesso: {
    type: Boolean,
    default: true
  },
  
  // ✅ ERRO SE HOUVER
  erro: String
});

// ✅ INDEXES PARA PERFORMANCE
userLogSchema.index({ userId: 1, timestamp: -1 });
userLogSchema.index({ acao: 1, timestamp: -1 });
userLogSchema.index({ timestamp: -1 });
userLogSchema.index({ sucesso: 1, timestamp: -1 });

// ✅ MÉTODO ESTÁTICO PARA CRIAR LOG FACILMENTE
userLogSchema.statics.criarLog = async function(dadosLog) {
  try {
    const log = new this({
      userId: dadosLog.userId,
      acao: dadosLog.acao,
      detalhes: dadosLog.detalhes,
      ip: dadosLog.ip,
      userAgent: dadosLog.userAgent,
      metadados: dadosLog.metadados || {},
      usuarioInfo: dadosLog.usuarioInfo,
      sucesso: dadosLog.sucesso !== false,
      erro: dadosLog.erro
    });
    
    await log.save();
    return log;
  } catch (error) {
    console.error('Erro ao criar log de usuário:', error);
    // Não falhar a operação principal por causa do log
    return null;
  }
};

// ✅ MÉTODO PARA BUSCAR LOGS COM FILTROS
userLogSchema.statics.buscarLogs = function(filtros = {}) {
  const query = {};
  
  if (filtros.userId) query.userId = filtros.userId;
  if (filtros.acao) query.acao = filtros.acao;
  if (filtros.sucesso !== undefined) query.sucesso = filtros.sucesso;
  
  if (filtros.dataInicio || filtros.dataFim) {
    query.timestamp = {};
    if (filtros.dataInicio) query.timestamp.$gte = new Date(filtros.dataInicio);
    if (filtros.dataFim) query.timestamp.$lte = new Date(filtros.dataFim);
  }
  
  return this.find(query)
    .populate('userId', 'name email role')
    .sort({ timestamp: -1 })
    .limit(filtros.limit || 100);
};

// ✅ MÉTODO PARA ESTATÍSTICAS
userLogSchema.statics.obterEstatisticas = async function(periodo = 7) {
  const dataInicio = new Date();
  dataInicio.setDate(dataInicio.getDate() - periodo);
  
  const pipeline = [
    {
      $match: {
        timestamp: { $gte: dataInicio }
      }
    },
    {
      $group: {
        _id: '$acao',
        total: { $sum: 1 },
        sucessos: {
          $sum: { $cond: ['$sucesso', 1, 0] }
        },
        falhas: {
          $sum: { $cond: ['$sucesso', 0, 1] }
        }
      }
    },
    {
      $sort: { total: -1 }
    }
  ];
  
  return this.aggregate(pipeline);
};

module.exports = mongoose.model('UserLog', userLogSchema);
