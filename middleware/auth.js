// middleware/auth.js - CORRIGIDO para exportar todas as funções corretamente

const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware para verificar autenticação
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
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Token inválido. Usuário não encontrado.'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Conta desativada. Entre em contato com o administrador.'
      });
    }

    // Adicionar usuário ao objeto de requisição
    req.user = user;
    next();
  } catch (error) {
    console.error('Erro no middleware de autenticação:', error.message); // Logar a mensagem de erro específica
    
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
        message: 'Usuário não autenticado para autorização.' // Mensagem mais clara
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

// Middleware para verificar permissões específicas
const checkPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado para verificação de permissão.' // Mensagem mais clara
      });
    }

    // Admin sempre tem todas as permissões
    if (req.user.role === 'admin') {
      return next();
    }

    // Esta lógica assume que `req.user.permissions` é um array de strings de permissão
    // ou um objeto onde as chaves são as permissões. Ajuste conforme sua estrutura.
    // A função getPermissions do seu `routes/auth.js` precisaria popular `req.user.permissions`
    // ou ser chamada aqui. Para este exemplo, vamos supor que `req.user.permissions` é um array.
    // Se `user.permissions` vem do modelo User e é um array:
    // if (!req.user.permissions || !req.user.permissions.includes(permission)) {
    // Se `user.permissions` é um objeto { permissao: true }:
    if (!req.user.permissions || !req.user.permissions[permission]) {
      return res.status(403).json({
        success: false,
        message: `Acesso negado. Permissão '${permission}' necessária.`,
        requiredPermission: permission
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
      message: 'Usuário não autenticado para verificação de propriedade.' // Mensagem mais clara
    });
  }

  const targetUserId = req.params.userId || req.params.id;
  
  if (req.user.role === 'admin') {
    return next();
  }

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
      const user = await User.findById(decoded.id).select('-password');
      
      if (user && user.isActive) {
        req.user = user;
      }
    }
    next();
  } catch (error) {
    // Em autenticação opcional, erros de token (expirado, inválido) não param a requisição.
    // O usuário simplesmente não é definido em req.user.
    // Pode ser útil logar o erro para debug, mas não enviar resposta de erro.
    // console.warn('Erro em optionalAuth (ignorado):', error.message);
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
      const retryAfterSeconds = Math.max(0, Math.ceil((oldestRequestInWindow + windowMs - now) / 1000)); // Garante não ser negativo
      
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

// Utilitário para gerar refresh token (válido por mais tempo)
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { id: userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, // Use um segredo dedicado se possível
    { expiresIn: '7d' }
  );
};

// --- BLOCO DE EXPORTAÇÃO CORRIGIDO ---

// Exportar 'authenticate' como padrão para compatibilidade com `const auth = require(...)`
module.exports = authenticate;

// Adicionar 'authenticate' e 'auth' como propriedades para diferentes estilos de importação
module.exports.authenticate = authenticate;
module.exports.auth = authenticate; // Para compatibilidade se algum código usar `require(...).auth`

// Exportar TODAS as outras funções como propriedades nomeadas
// para permitir a importação desestruturada: const { authorize } = require(...), etc.
module.exports.authorize = authorize;
module.exports.checkPermission = checkPermission;
module.exports.checkOwnershipOrAdmin = checkOwnershipOrAdmin;
module.exports.optionalAuth = optionalAuth;
module.exports.rateLimitByUser = rateLimitByUser;
module.exports.generateToken = generateToken;
module.exports.generateRefreshToken = generateRefreshToken;
