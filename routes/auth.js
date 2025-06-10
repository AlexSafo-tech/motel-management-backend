// routes/auth.js - Rotas de autenticação CORRIGIDAS
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

// ✅ POST /api/auth/login - LOGIN (ROTA CORRIGIDA)
router.post('/login', async (req, res) => {
  try {
    console.log('🔑 Tentativa de login:', req.body.email);
    
    const { email, password } = req.body;

    // Validação básica
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email e senha são obrigatórios'
      });
    }

    // Buscar usuário no banco
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.log('❌ Usuário não encontrado:', email);
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas'
      });
    }

    // Verificar se usuário está ativo
    if (!user.isActive) {
      console.log('❌ Usuário inativo:', email);
      return res.status(401).json({
        success: false,
        message: 'Conta desativada. Entre em contato com o administrador.'
      });
    }

    // Verificar se está bloqueado (se a função existir)
    if (user.isBlocked && user.isBlocked()) {
      console.log('❌ Usuário bloqueado:', email);
      return res.status(429).json({
        success: false,
        message: 'Muitas tentativas de login. Tente novamente mais tarde.',
        blockedUntil: user.bloqueadoAte
      });
    }

    // Verificar senha
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      console.log('❌ Senha incorreta para:', email);
      
      // Incrementar tentativas de login (se a função existir)
      if (user.incrementLoginAttempts) {
        user.incrementLoginAttempts();
        await user.save();
      }
      
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas'
      });
    }

    // ✅ LOGIN SUCESSFUL!
    console.log('✅ Login bem-sucedido:', email);

    // Resetar tentativas de login (se a função existir)
    if (user.resetLoginAttempts) {
      user.resetLoginAttempts();
    }
    user.lastLogin = new Date();
    user.ultimoLogin = new Date();
    await user.save();

    // Gerar token JWT
    const token = generateToken(user._id, user.email, user.role);

    // Preparar dados do usuário (sem senha)
    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      permissions: user.permissions,
      lastLogin: user.lastLogin,
      isActive: user.isActive
    };

    console.log('🎉 Token gerado para:', email);

    res.json({
      success: true,
      message: 'Login realizado com sucesso',
      token: token,
      user: userData
    });

  } catch (error) {
    console.error('❌ Erro no login:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor durante o login'
    });
  }
});

// ✅ POST /api/auth/register - REGISTRO
router.post('/register', async (req, res) => {
  try {
    console.log('📝 Tentativa de registro:', req.body.email);
    
    const { name, email, password, role = 'user' } = req.body;

    // Validação básica
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Nome, email e senha são obrigatórios'
      });
    }

    // Verificar se usuário já existe
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Usuário já existe com este email'
      });
    }

    // Criar novo usuário
    const user = new User({
      name,
      email: email.toLowerCase(),
      password,
      role,
      isActive: true,
      isVerified: true
    });

    await user.save();

    console.log('✅ Usuário criado:', email);

    // Gerar token
    const token = generateToken(user._id, user.email, user.role);

    // Dados do usuário
    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive
    };

    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso',
      token: token,
      user: userData
    });

  } catch (error) {
    console.error('❌ Erro no registro:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor durante o registro'
    });
  }
});

// ✅ GET /api/auth/verify - VERIFICAR TOKEN
router.get('/verify', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || req.header('x-auth-token');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token não fornecido'
      });
    }

    // Verificar token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Buscar usuário
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Token inválido ou usuário inativo'
      });
    }

    res.json({
      success: true,
      message: 'Token válido',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        permissions: user.permissions,
        isActive: user.isActive
      }
    });

  } catch (error) {
    console.error('❌ Erro na verificação do token:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token inválido'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expirado'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ POST /api/auth/logout - LOGOUT
router.post('/logout', (req, res) => {
  try {
    console.log('👋 Logout realizado');
    
    res.json({
      success: true,
      message: 'Logout realizado com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro no logout:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ GET /api/auth/me - DADOS DO USUÁRIO ATUAL
router.get('/me', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || req.header('x-auth-token');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token não fornecido'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        permissions: user.permissions,
        lastLogin: user.lastLogin,
        isActive: user.isActive,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Erro ao buscar dados do usuário:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;
