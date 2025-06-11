// routes/auth.js - CORRIGIDO COM SINTAXE CORRETA
const express = require('express');
const jwt = require('jsonwebtoken');
const bcryptjs = require('bcryptjs'); // ✅ Importar bcryptjs no topo
const User = require('../models/User');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

// ✅ POST /api/auth/login - LOGIN CORRIGIDO
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

    console.log('👤 Usuário encontrado:', {
      email: user.email,
      isActive: user.isActive,
      ativo: user.ativo,
      status: user.status,
      role: user.role
    });

    // ✅ VERIFICAÇÃO DE ATIVAÇÃO MAIS FLEXÍVEL
    const isUserActive = 
      user.isActive === true || 
      user.ativo === true || 
      user.status === 'active' || 
      user.status === 'ativo' ||
      user.role === 'admin'; // Admin sempre ativo

    if (!isUserActive) {
      console.log('❌ Usuário inativo - campos verificados:', {
        isActive: user.isActive,
        ativo: user.ativo,
        status: user.status,
        role: user.role
      });
      
      // ✅ FORÇAR ATIVAÇÃO PARA ADMIN
      if (user.role === 'admin') {
        console.log('🔧 Forçando ativação para admin');
        user.ativo = true;
        await user.save();
      } else {
        return res.status(401).json({
          success: false,
          message: 'Conta desativada. Entre em contato com o administrador.'
        });
      }
    }

    // Verificar senha
    let isPasswordValid = false;
    
    try {
      // Tentar método comparePassword se existir
      if (typeof user.comparePassword === 'function') {
        isPasswordValid = await user.comparePassword(password);
      } else {
        // Fallback: comparação direta usando bcryptjs
        isPasswordValid = await bcryptjs.compare(password, user.password || user.senha);
      }
    } catch (passwordError) {
      console.log('⚠️ Erro na verificação de senha:', passwordError.message);
      // Último fallback: comparação de texto (só para debug)
      isPasswordValid = (user.password === password || user.senha === password);
    }
    
    if (!isPasswordValid) {
      console.log('❌ Senha incorreta para:', email);
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas'
      });
    }

    // ✅ LOGIN BEM-SUCEDIDO!
    console.log('✅ Login bem-sucedido:', email);

    // Atualizar último login
    user.ultimoLogin = new Date();
    await user.save();

    // Gerar token JWT
    const token = generateToken(user._id, user.email, user.role);

    // ✅ PREPARAR DADOS DO USUÁRIO (CAMPO FLEXÍVEL)
    const userData = {
      id: user._id,
      name: user.name || user.nomeCompleto || user.nome || 'Usuário',
      email: user.email,
      role: user.role || 'user',
      avatar: user.avatar,
      permissions: user.permissoes || user.permissions || {},
      lastLogin: user.ultimoLogin,
      isActive: true // Sempre true após login bem-sucedido
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

// ✅ POST /api/auth/register - REGISTRO CORRIGIDO
router.post('/register', async (req, res) => {
  try {
    console.log('📝 Tentativa de registro:', req.body.email);
    
    const { name, nomeCompleto, email, password, senha, role = 'funcionario' } = req.body;

    // Validação flexível
    const userName = name || nomeCompleto;
    const userPassword = password || senha;
    
    if (!userName || !email || !userPassword) {
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

    // ✅ CRIAR USUÁRIO COM CAMPOS FLEXÍVEIS
    const userData = {
      nomeCompleto: userName,
      email: email.toLowerCase(),
      senha: userPassword, // Vai ser hashada pelo pre('save')
      role,
      ativo: true
    };

    const user = new User(userData);
    await user.save();

    console.log('✅ Usuário criado:', email);

    // Gerar token
    const token = generateToken(user._id, user.email, user.role);

    // Dados do usuário
    const responseUserData = {
      id: user._id,
      name: user.nomeCompleto,
      email: user.email,
      role: user.role,
      isActive: true
    };

    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso',
      token: token,
      user: responseUserData
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

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password -senha');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Token inválido ou usuário não encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Token válido',
      user: {
        id: user._id,
        name: user.name || user.nomeCompleto || 'Usuário',
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        permissions: user.permissoes || user.permissions,
        isActive: true
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
    const user = await User.findById(decoded.id).select('-password -senha');
    
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
        name: user.name || user.nomeCompleto || 'Usuário',
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        permissions: user.permissoes || user.permissions,
        lastLogin: user.ultimoLogin,
        isActive: true,
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

// ✅ ENDPOINT TEMPORÁRIO PARA RESETAR SENHA DO ADMIN
router.post('/reset-admin-password', async (req, res) => {
  try {
    console.log('🔧 Resetando senha do admin...');
    
    const { newPassword = '123456' } = req.body;
    
    // Buscar admin no MongoDB
    const admin = await User.findOne({ email: 'admin@pmsmotel.com' });
    
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin não encontrado'
      });
    }
    
    console.log('👤 Admin encontrado:', {
      email: admin.email,
      nomeCompleto: admin.nomeCompleto,
      role: admin.role,
      ativo: admin.ativo
    });
    
    // Gerar novo hash da senha
    const salt = await bcryptjs.genSalt(10);
    const novoHash = await bcryptjs.hash(newPassword, salt);
    
    // Atualizar no MongoDB
    await User.updateOne(
      { email: 'admin@pmsmotel.com' },
      {
        $set: {
          senha: novoHash,
          ativo: true,
          role: 'admin'
        }
      }
    );
    
    console.log('✅ Senha resetada com sucesso!');
    console.log('🔑 Nova senha:', newPassword);
    console.log('🔒 Novo hash:', novoHash);
    
    // Testar o novo hash
    const teste = await bcryptjs.compare(newPassword, novoHash);
    console.log('🧪 Teste de verificação:', teste ? '✅ OK' : '❌ FALHOU');
    
    res.json({
      success: true,
      message: 'Senha do admin resetada com sucesso!',
      newPassword: newPassword,
      hashGerado: novoHash,
      testeVerificacao: teste
    });
    
  } catch (error) {
    console.error('❌ Erro ao resetar senha:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// ✅ ENDPOINT PARA TESTAR SENHAS CONTRA O HASH ATUAL
router.post('/test-password', async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Senha é obrigatória'
      });
    }
    
    // Buscar admin
    const admin = await User.findOne({ email: 'admin@pmsmotel.com' });
    
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin não encontrado'
      });
    }
    
    // Testar senha
    const isValid = await bcryptjs.compare(password, admin.senha);
    
    console.log(`🧪 Teste senha "${password}":`, isValid ? '✅ CORRETA' : '❌ INCORRETA');
    
    res.json({
      success: true,
      passwordTested: password,
      isValid: isValid,
      currentHash: admin.senha,
      message: isValid ? 'Senha correta!' : 'Senha incorreta'
    });
    
  } catch (error) {
    console.error('❌ Erro ao testar senha:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;
