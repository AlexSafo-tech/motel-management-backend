// ===============================================
// 1. MODELO DE USUÁRIO ATUALIZADO (models/User.js)
// ===============================================

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  // ✅ DADOS PESSOAIS
  nomeCompleto: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  senha: { type: String, required: true },
  
  // ✅ DADOS OPCIONAIS
  cpf: { type: String, sparse: true, unique: true },
  telefone: { type: String },
  avatar: { type: String, default: '👤' },
  
  // ✅ DADOS DO SISTEMA
  role: { 
    type: String, 
    enum: ['admin', 'gerente', 'recepcionista', 'funcionario', 'cozinha', 'camareira'],
    default: 'funcionario'
  },
  ativo: { type: Boolean, default: true },
  
  // ✅ PERMISSÕES GRANULARES POR PÁGINA/FUNCIONALIDADE
  permissoes: {
    // DASHBOARD
    dashboard: {
      visualizar: { type: Boolean, default: true },
      relatorios: { type: Boolean, default: false },
      estatisticas: { type: Boolean, default: false }
    },
    
    // RESERVAS
    reservas: {
      visualizar: { type: Boolean, default: false },
      criar: { type: Boolean, default: false },
      editar: { type: Boolean, default: false },
      cancelar: { type: Boolean, default: false },
      checkin: { type: Boolean, default: false },
      checkout: { type: Boolean, default: false },
      relatorios: { type: Boolean, default: false }
    },
    
    // PEDIDOS
    pedidos: {
      visualizar: { type: Boolean, default: false },
      criar: { type: Boolean, default: false },
      editar: { type: Boolean, default: false },
      cancelar: { type: Boolean, default: false },
      controleEstoque: { type: Boolean, default: false },
      configurarCardapio: { type: Boolean, default: false },
      relatorios: { type: Boolean, default: false }
    },
    
    // QUARTOS
    quartos: {
      visualizar: { type: Boolean, default: false },
      criar: { type: Boolean, default: false },
      editar: { type: Boolean, default: false },
      excluir: { type: Boolean, default: false },
      alterarStatus: { type: Boolean, default: false },
      configuracoes: { type: Boolean, default: false },
      manutencao: { type: Boolean, default: false }
    },
    
    // PRODUTOS/CARDÁPIO
    produtos: {
      visualizar: { type: Boolean, default: false },
      criar: { type: Boolean, default: false },
      editar: { type: Boolean, default: false },
      excluir: { type: Boolean, default: false },
      gerenciarEstoque: { type: Boolean, default: false },
      configurarPrecos: { type: Boolean, default: false },
      categorias: { type: Boolean, default: false }
    },
    
    // PERÍODOS
    periodos: {
      visualizar: { type: Boolean, default: false },
      criar: { type: Boolean, default: false },
      editar: { type: Boolean, default: false },
      excluir: { type: Boolean, default: false },
      configurarPrecos: { type: Boolean, default: false }
    },
    
    // FINANCEIRO
    financeiro: {
      visualizar: { type: Boolean, default: false },
      relatorios: { type: Boolean, default: false },
      faturamento: { type: Boolean, default: false },
      despesas: { type: Boolean, default: false },
      exportar: { type: Boolean, default: false }
    },
    
    // USUÁRIOS (ADMIN)
    usuarios: {
      visualizar: { type: Boolean, default: false },
      criar: { type: Boolean, default: false },
      editar: { type: Boolean, default: false },
      excluir: { type: Boolean, default: false },
      gerenciarPermissoes: { type: Boolean, default: false },
      logs: { type: Boolean, default: false }
    },
    
    // CONFIGURAÇÕES
    configuracoes: {
      sistema: { type: Boolean, default: false },
      backup: { type: Boolean, default: false },
      integracao: { type: Boolean, default: false },
      personalização: { type: Boolean, default: false }
    }
  },
  
  // ✅ METADADOS
  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  ultimoLogin: { type: Date },
  tentativasLogin: { type: Number, default: 0 },
  bloqueadoAte: { type: Date },
  
  // ✅ TIMESTAMPS
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// ✅ MIDDLEWARE PARA ADMIN PADRÃO
UserSchema.pre('save', function(next) {
  if (this.role === 'admin') {
    // Admin tem todas as permissões
    const allPermissions = {
      dashboard: { visualizar: true, relatorios: true, estatisticas: true },
      reservas: { visualizar: true, criar: true, editar: true, cancelar: true, checkin: true, checkout: true, relatorios: true },
      pedidos: { visualizar: true, criar: true, editar: true, cancelar: true, controleEstoque: true, configurarCardapio: true, relatorios: true },
      quartos: { visualizar: true, criar: true, editar: true, excluir: true, alterarStatus: true, configuracoes: true, manutencao: true },
      produtos: { visualizar: true, criar: true, editar: true, excluir: true, gerenciarEstoque: true, configurarPrecos: true, categorias: true },
      periodos: { visualizar: true, criar: true, editar: true, excluir: true, configurarPrecos: true },
      financeiro: { visualizar: true, relatorios: true, faturamento: true, despesas: true, exportar: true },
      usuarios: { visualizar: true, criar: true, editar: true, excluir: true, gerenciarPermissoes: true, logs: true },
      configuracoes: { sistema: true, backup: true, integracao: true, personalização: true }
    };
    this.permissoes = allPermissions;
  }
  next();
});

module.exports = mongoose.model('User', UserSchema);
