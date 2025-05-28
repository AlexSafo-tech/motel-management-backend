// middleware/auth.js - Middleware de autenticação e autorização

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

// Middleware para verificar permissões específicas
const checkPermission = (permission) => {
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

    // Verificar se o usuário tem a permissão específica
    // Esta lógica assume que req.user.permissions é um objeto como { 'nomeDaPermissao': true }
    // ou que você tem uma função getPermissions(user.role) que retorna um array ou objeto.
    // Se `req.user.permissions` não está populado com as permissões do usuário vindas do BD ou de uma definição de role,
    // esta verificação pode não funcionar como esperado. No seu `routes/auth.js`, `getPermissions` é chamado,
    // mas o resultado não parece ser anexado a `req.user` diretamente no middleware `authenticate`.
    // Isso pode ser um ponto de atenção para a lógica de `checkPermission`.
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
      message: 'Usuário não autenticado.'
    });
  }

  const targetUserId = req.params.userId || req.params.id;
  
  // Admin pode acessar qualquer usuário
  if (req.user.role === 'admin') {
    return next();
  }

  // Usuário pode acessar apenas seus próprios dados
  // req.user._id vem do token/DB, targetUserId vem dos parâmetros da rota
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
    // Ignorar erros de token em autenticação opcional (ex: token expirado ou inválido)
    // O usuário simplesmente não será autenticado, mas a requisição continua.
    next();
  }
};

// Middleware para rate limiting simples
const rateLimitByUser = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();

  return (req, res, next) => {
    const userId = req.user?._id?.toString() || req.ip; // Usa userId se autenticado, senão IP
    const now = Date.now();
    
    // Inicializa o array de timestamps de requisição para o usuário, se não existir
    if (!requests.has(userId)) {
      requests.set(userId, []);
    }

    const userTimestamps = requests.get(userId);
    
    // Remove timestamps que estão fora da janela de tempo
    const windowStart = now - windowMs;
    const recentTimestamps = userTimestamps.filter(time => time > windowStart);
    requests.set(userId, recentTimestamps);

    if (recentTimestamps.length >= maxRequests) {
      // Calcula o tempo para a próxima tentativa (aproximado)
      const oldestRequestInWindow = recentTimestamps.length > 0 ? recentTimestamps[0] : now;
      const retryAfterSeconds = Math.ceil((oldestRequestInWindow + windowMs - now) / 1000);
      
      res.setHeader('Retry-After', retryAfterSeconds);
      return res.status(429).json({
        success: false,
        message: 'Muitas requisições. Tente novamente em alguns minutos.',
        retryAfter: retryAfterSeconds // Informa o cliente em segundos
      });
    }

    recentTimestamps.push(now);
    next();
  };
};

// Utilitário para gerar token JWT
const generateToken = (userId, email, role) => { // Adicionado email e role para um payload mais rico
  return jwt.sign(
    { id: userId, email, role }, // Payload do token
    process.env.JWT_SECRET,
    { expiresIn: '24h' } // Tempo de expiração do token
  );
};

// Utilitário para gerar refresh token (válido por mais tempo)
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { id: userId, type: 'refresh' }, // type: 'refresh' para distinguir de access tokens
    process.env.JWT_REFRESH_SECRET, // Idealmente, usar um segredo diferente para refresh tokens
    { expiresIn: '7d' } // Tempo de expiração maior para refresh tokens
  );
};

/* // Bloco de exportação original que será substituído:
module.exports = {
  authenticate,
  authorize,
  checkPermission,
  checkOwnershipOrAdmin,
  optionalAuth,
  rateLimitByUser,
  generateToken,
  generateRefreshToken
};
*/

// ✅ EXPORTAR TAMBÉM COMO 'auth' PARA COMPATIBILIDADE
module.exports = authenticate; // Agora 'authenticate' é a exportação principal
module.exports.auth = authenticate; // Permite require('...').auth ou const { auth } = require('...')
module.exports.authenticate = authenticate; // Permite const { authenticate } = require('...')

// Para exportar as outras funções também, você precisaria adicioná-las como propriedades aqui:
// module.exports.authorize = authorize;
// module.exports.checkPermission = checkPermission;
// module.exports.checkOwnershipOrAdmin = checkOwnershipOrAdmin;
// module.exports.optionalAuth = optionalAuth;
// module.exports.rateLimitByUser = rateLimitByUser;
// module.exports.generateToken = generateToken;
// module.exports.generateRefreshToken = generateRefreshToken;
