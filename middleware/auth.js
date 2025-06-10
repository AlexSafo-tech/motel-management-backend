// middleware/auth.js - CORRIGIDO PARA COMPATIBILIDADE COM MONGODB REAL

const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ✅ MIDDLEWARE DE AUTENTICAÇÃO CORRIGIDO
const authenticate = async (req, res, next) => {
  try {
    const token = req.header('x-auth-token') || req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Acesso negado. Token de autenticação não fornecido.'
      });
    }

    // Verificar e decodificar o token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Buscar usuário no banco de dados
    const user = await User.findById(decoded.id).select('-password -senha');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Token inválido. Usuário não encontrado.'
      });
    }

    // ✅ VERIFICAÇÃO DE ATIVAÇÃO COMPATÍVEL COM MONGODB REAL
    const isUserActive = 
      user.ativo === true || 
      user.isActive === true || 
      user.status === 'active' || 
      user.status === 'ativo' ||
      user.role === 'admin'; // Admin sempre ativo

    if (!isUserActive) {
      console.log('❌ Usuário inativo - campos verificados:', {
        ativo: user.ativo,
        isActive: user.isActive,
        status: user.status,
        role: user.role
      });
      
      return res.status(401).json({
        success: false,
        message: 'Conta desativada. Entre em contato com o administrador.'
      });
    }

    // Adicionar usuário ao objeto de requisição
    req.user = user;
    next();
  } catch (error) {
    console.error('Erro no middleware de autenticação:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token inválido.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expirado. Faça login novamente.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor durante autenticação.'
    });
  }
};

// Middleware para verificar permissões por role
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado. Permissão insuficiente.',
        requiredRoles: roles,
        userRole: req.user.role
      });
    }

    next();
  };
};

// ✅ MIDDLEWARE DE PERMISSÕES CORRIGIDO PARA NOVO MODELO
const checkPermission = (moduleName, actionName) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado.'
      });
    }

    // Admin sempre tem todas as permissões
    if (req.user.role === 'admin') {
      return next();
    }

    // Verificar permissões granulares do novo modelo
    const userPermissions = req.user.permissoes || {};
    const modulePermissions = userPermissions[moduleName];
    
    if (!modulePermissions || !modulePermissions[actionName]) {
      return res.status(403).json({
        success: false,
        message: `Acesso negado. Permissão '${moduleName}.${actionName}' necessária.`,
        requiredPermission: `${moduleName}.${actionName}`,
        userRole: req.user.role
      });
    }

    next();
  };
};

// Middleware para verificar se é o próprio usuário ou admin
const checkOwnershipOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Usuário não autenticado.'
    });
  }

  const targetUserId = req.params.userId || req.params.id;
  
  // Admin pode acessar qualquer usuário
  if (req.user.role === 'admin') {
    return next();
  }

  // Usuário pode acessar apenas seus próprios dados
  if (req.user._id && req.user._id.toString() === targetUserId) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Acesso negado. Você só pode acessar seus próprios dados.'
  });
};

// Middleware para login opcional (não obrigatório)
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('x-auth-token') || req.header('Authorization')?.replace('Bearer ', '');

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password -senha');
      
      // ✅ VERIFICAÇÃO DE ATIVAÇÃO CORRIGIDA
      const isUserActive = 
        user.ativo === true || 
        user.isActive === true || 
        user.status === 'active' || 
        user.role === 'admin';
        
      if (user && isUserActive) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // Ignorar erros de token em autenticação opcional
    next();
  }
};

// Middleware para rate limiting simples
const rateLimitByUser = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();

  return (req, res, next) => {
    const userId = req.user?._id?.toString() || req.ip;
    const now = Date.now();
    
    if (!requests.has(userId)) {
      requests.set(userId, []);
    }

    const userTimestamps = requests.get(userId);
    
    const windowStart = now - windowMs;
    const recentTimestamps = userTimestamps.filter(time => time > windowStart);
    requests.set(userId, recentTimestamps);

    if (recentTimestamps.length >= maxRequests) {
      const oldestRequestInWindow = recentTimestamps.length > 0 ? recentTimestamps[0] : now;
      const retryAfterSeconds = Math.ceil((oldestRequestInWindow + windowMs - now) / 1000);
      
      res.setHeader('Retry-After', retryAfterSeconds);
      return res.status(429).json({
        success: false,
        message: 'Muitas requisições. Tente novamente em alguns minutos.',
        retryAfter: retryAfterSeconds
      });
    }

    recentTimestamps.push(now);
    next();
  };
};

// Utilitário para gerar token JWT
const generateToken = (userId, email, role) => {
  return jwt.sign(
    { id: userId, email, role },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Utilitário para gerar refresh token
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { id: userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// ✅ EXPORTAÇÕES
module.exports = authenticate;
module.exports.authenticate = authenticate;
module.exports.authorize = authorize;
module.exports.checkPermission = checkPermission;
module.exports.checkOwnershipOrAdmin = checkOwnershipOrAdmin;
module.exports.optionalAuth = optionalAuth;
module.exports.rateLimitByUser = rateLimitByUser;
module.exports.generateToken = generateToken;
module.exports.generateRefreshToken = generateRefreshToken;
