// middleware/permissions.js - Sistema de permissões por nível de usuário
const UserLog = require('../models/UserLog');

// ✅ MAPEAMENTO DE PERMISSÕES POR ROLE
const PERMISSIONS = {
  admin: [
    // Reservas
    'reservas.criar', 'reservas.editar', 'reservas.cancelar', 
    'reservas.checkin', 'reservas.checkout', 'reservas.visualizar', 'reservas.relatorios',
    
    // Pedidos
    'pedidos.criar', 'pedidos.editar', 'pedidos.cancelar',
    'pedidos.gerenciar_status', 'pedidos.visualizar', 'pedidos.relatorios',
    
    // Produtos e Cardápio
    'cardapio.visualizar', 'cardapio.criar', 'cardapio.editar', 
    'cardapio.remover', 'categorias.gerenciar',
    
    // Estoque
    'estoque.visualizar', 'estoque.ajustar', 'estoque.compras', 'estoque.relatorios',
    
    // Sistema
    'quartos.gerenciar', 'usuarios.gerenciar', 'configuracoes.sistema',
    'analytics.avancado', 'backup.dados',
    
    // Financeiro
    'financeiro.receitas', 'financeiro.custos', 'financeiro.margem', 'financeiro.relatorios',
    
    // Wildcard para admin
    '*'
  ],
  
  recepcionista: [
    // Reservas
    'reservas.criar', 'reservas.editar', 'reservas.checkin', 
    'reservas.checkout', 'reservas.visualizar',
    
    // Pedidos
    'pedidos.criar', 'pedidos.visualizar', 'pedidos.gerenciar_status',
    
    // Produtos (somente visualizar)
    'cardapio.visualizar',
    
    // Quartos
    'quartos.visualizar', 'quartos.status',
    
    // Relatórios básicos
    'relatorios.basicos'
  ],
  
  camareira: [
    // Quartos
    'quartos.visualizar', 'quartos.status', 'quartos.limpeza', 'quartos.manutencao',
    
    // Reservas (somente visualizar para saber ocupação)
    'reservas.visualizar',
    
    // Pedidos (somente para entrega)
    'pedidos.visualizar', 'pedidos.entregar'
  ],
  
  cozinha: [
    // Pedidos
    'pedidos.visualizar', 'pedidos.gerenciar_status',
    
    // Cardápio (visualizar para saber ingredientes)
    'cardapio.visualizar',
    
    // Estoque (visualizar para verificar disponibilidade)
    'estoque.visualizar'
  ]
};

// ✅ INFORMAÇÕES DOS ROLES
const ROLE_INFO = {
  admin: {
    id: 'admin',
    nome: 'Administrador',
    descricao: 'Acesso completo ao sistema',
    icone: '👑',
    cor: '#F44336'
  },
  recepcionista: {
    id: 'recepcionista',
    nome: 'Recepcionista',
    descricao: 'Focado em atendimento e reservas',
    icone: '🧑‍💼',
    cor: '#2196F3'
  },
  camareira: {
    id: 'camareira',
    nome: 'Camareira',
    descricao: 'Focado em limpeza e manutenção',
    icone: '🧹',
    cor: '#4CAF50'
  },
  cozinha: {
    id: 'cozinha',
    nome: 'Cozinha',
    descricao: 'Focado em preparo de pedidos',
    icone: '👨‍🍳',
    cor: '#FF9800'
  }
};

// ✅ MIDDLEWARE PRINCIPAL DE VERIFICAÇÃO DE PERMISSÕES
const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Token não fornecido'
        });
      }

      // ✅ VERIFICAR SE USUÁRIO ESTÁ ATIVO
      if (!user.isActive && !user.ativo) {
        await UserLog.criarLog({
          userId: user._id,
          acao: 'access_denied',
          detalhes: `Tentativa de acesso com usuário inativo: ${requiredPermission}`,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          usuarioInfo: {
            nome: user.name,
            email: user.email,
            role: user.role
          },
          sucesso: false
        });

        return res.status(403).json({
          success: false,
          message: 'Usuário desativado. Contate o administrador.'
        });
      }

      // ✅ OBTER PERMISSÕES DO USUÁRIO
      const userPermissions = PERMISSIONS[user.role] || [];
      
      // ✅ VERIFICAR PERMISSÃO
      const hasPermission = userPermissions.some(permission => {
        // Admin com wildcard
        if (permission === '*') return true;
        
        // Permissão exata
        if (permission === requiredPermission) return true;
        
        // Permissão com wildcard (ex: reservas.*)
        if (permission.endsWith('.*')) {
          const basePermission = permission.replace('.*', '');
          return requiredPermission.startsWith(basePermission);
        }
        
        return false;
      });

      if (!hasPermission) {
        await UserLog.criarLog({
          userId: user._id,
          acao: 'permission_denied',
          detalhes: `Permissão negada para: ${requiredPermission}`,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          usuarioInfo: {
            nome: user.name,
            email: user.email,
            role: user.role
          },
          metadados: {
            permissaoRequerida: requiredPermission,
            permissoesUsuario: userPermissions
          },
          sucesso: false
        });

        return res.status(403).json({
          success: false,
          message: 'Permissão insuficiente para esta operação',
          details: {
            required: requiredPermission,
            userRole: user.role
          }
        });
      }

      // ✅ PERMISSÃO CONCEDIDA
      req.userPermissions = userPermissions;
      next();

    } catch (error) {
      console.error('Erro no middleware de permissões:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  };
};

// ✅ MIDDLEWARE PARA VERIFICAR MÚLTIPLAS PERMISSÕES
const checkAnyPermission = (requiredPermissions) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Token não fornecido'
        });
      }

      const userPermissions = PERMISSIONS[user.role] || [];
      
      // ✅ VERIFICAR SE TEM PELO MENOS UMA DAS PERMISSÕES
      const hasAnyPermission = requiredPermissions.some(reqPerm =>
        userPermissions.some(userPerm => {
          if (userPerm === '*') return true;
          if (userPerm === reqPerm) return true;
          if (userPerm.endsWith('.*')) {
            const basePermission = userPerm.replace('.*', '');
            return reqPerm.startsWith(basePermission);
          }
          return false;
        })
      );

      if (!hasAnyPermission) {
        await UserLog.criarLog({
          userId: user._id,
          acao: 'permission_denied',
          detalhes: `Nenhuma das permissões requeridas: ${requiredPermissions.join(', ')}`,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          usuarioInfo: {
            nome: user.name,
            email: user.email,
            role: user.role
          },
          sucesso: false
        });

        return res.status(403).json({
          success: false,
          message: 'Permissão insuficiente'
        });
      }

      next();

    } catch (error) {
      console.error('Erro no middleware de múltiplas permissões:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  };
};

// ✅ MIDDLEWARE PARA ADMIN APENAS
const adminOnly = checkPermission('*');

// ✅ FUNÇÃO PARA OBTER PERMISSÕES DE UM ROLE
const getPermissions = (role) => {
  return PERMISSIONS[role] || [];
};

// ✅ FUNÇÃO PARA OBTER INFO DE UM ROLE
const getRoleInfo = (role) => {
  return ROLE_INFO[role] || null;
};

// ✅ FUNÇÃO PARA VERIFICAR SE USUÁRIO TEM PERMISSÃO (uso em outros lugares)
const hasPermission = (user, permission) => {
  const userPermissions = PERMISSIONS[user.role] || [];
  
  return userPermissions.some(userPerm => {
    if (userPerm === '*') return true;
    if (userPerm === permission) return true;
    if (userPerm.endsWith('.*')) {
      const basePermission = userPerm.replace('.*', '');
      return permission.startsWith(basePermission);
    }
    return false;
  });
};

module.exports = {
  checkPermission,
  checkAnyPermission,
  adminOnly,
  getPermissions,
  getRoleInfo,
  hasPermission,
  PERMISSIONS,
  ROLE_INFO
};
