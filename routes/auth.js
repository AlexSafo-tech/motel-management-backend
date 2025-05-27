// routes/auth.js - ATUALIZADO com sistema de permissões
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const UserLog = require('../models/UserLog');
const auth = require('../middleware/auth');
const { getPermissions, getRoleInfo } = require('../middleware/permissions');

const router = express.Router();

// ✅ LOGIN COM SISTEMA DE PERMISSÕES
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔐 Tentativa de login:', email);
    
    // ✅ VALIDAÇÕES BÁSICAS
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email e senha são obrigatórios'
      });
    }
    
    // ✅ BUSCAR USUÁRIO
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      // ✅ LOG DE TENTATIVA COM EMAIL INEXISTENTE
      await UserLog.criarLog({
        userId: null,
        acao: 'login_failed',
        detalhes: `Tentativa de login com email inexistente: ${email}`,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        usuarioInfo: null,
        sucesso: false
      });
      
      return res.status(401).json({
        success: false,
        message: 'Email ou senha incorretos'
      });
    }
    
    // ✅ VERIFICAR SE USUÁRIO ESTÁ ATIVO
    if (!user.isActive && !user.ativo) {
      await UserLog.criarLog({
        userId: user._id,
        acao: 'login_failed',
        detalhes: 'Tentativa de login com usuário inativo',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        usuarioInfo: {
          nome: user.name,
          email: user.email,
          role: user.role
        },
        sucesso: false
      });
      
      return res.status(401).json({
        success: false,
        message: 'Usuário desativado. Contate o administrador.'
      });
    }
    
    // ✅ VERIFICAR SE ESTÁ BLOQUEADO
    if (user.isBlocked && user.isBlocked()) {
      return res.status(401).json({
        success: false,
        message: 'Usuário temporariamente bloqueado. Tente novamente em alguns minutos.'
      });
    }
    
    // ✅ VERIFICAR SENHA
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      // ✅ INCREMENTAR TENTATIVAS E POSSÍVEL BLOQUEIO
      user.incrementLoginAttempts();
      await user.save();
      
      // ✅ LOG DE SENHA INCORRETA
      await UserLog.criarLog({
        userId: user._id,
        acao: 'login_failed',
        detalhes: `Senha incorreta. Tentativa ${user.tentativasLogin}`,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        usuarioInfo: {
          nome: user.name,
          email: user.email,
          role: user.role
        },
        metadados: {
          tentativas: user.tentativasLogin,
          bloqueado: user.isBlocked()
        },
        sucesso: false
      });
      
      let message = 'Email ou senha incorretos';
      if (user.tentativasLogin >= 5) {
        message += '. Usuário bloqueado por 15 minutos devido a múltiplas tentativas.';
      }
      
      return res.status(401).json({
        success: false,
        message
      });
    }
    
    // ✅ LOGIN BEM-SUCEDIDO - RESETAR TENTATIVAS
    user.resetLoginAttempts();
    user.lastLogin = new Date();
    user.ultimoLogin = new Date();
    await user.save();
    
    // ✅ GERAR TOKENS
    const tokenPayload = {
      id: user._id,
      email: user.email,
      role: user.role
    };
    
    const accessToken = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );
    
    const refreshToken = jwt.sign(
      { id: user._id, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET || 'your-refresh-secret',
      { expiresIn: '7d' }
    );
    
    // ✅ SALVAR REFRESH TOKEN
    if (!user.refreshTokens) user.refreshTokens = [];
    user.refreshTokens.push(refreshToken);
    
    // ✅ LIMITAR NÚMERO DE REFRESH TOKENS (máximo 5)
    if (user.refreshTokens.length > 5) {
      user.refreshTokens = user.refreshTokens.slice(-5);
    }
    
    await user.save();
    
    // ✅ OBTER PERMISSÕES E INFO DO ROLE
    const permissoes = getPermissions(user.role);
    const roleInfo = getRoleInfo(user.role);
    
    // ✅ LOG DE LOGIN BEM-SUCEDIDO
    await UserLog.criarLog({
      userId: user._id,
      acao: 'login',
      detalhes: 'Login realizado com sucesso',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      usuarioInfo: {
        nome: user.name,
        email: user.email,
        role: user.role
      },
      metadados: {
        permissoes: permissoes.length,
        roleInfo: roleInfo?.nome
      }
    });
    
    // ✅ RESPOSTA COMPLETA
    const userData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      ativo: user.ativo,
      lastLogin: user.lastLogin,
      ultimoLogin: user.ultimoLogin,
      
      // ✅ NOVAS INFORMAÇÕES PARA O APP
      permissoes,
      roleInfo: roleInfo || {
        id: 'recepcionista',
        nome: 'Recepcionista',
        icone: '🧑‍💼',
        cor: '#2196F3'
      }
    };
    
    res.json({
      success: true,
      message: 'Login realizado com sucesso',
      token: accessToken,
      refreshToken,
      expiresIn: '24h',
      user: userData
    });
    
    console.log('✅ Login bem-sucedido:', user.email, `(${user.role})`);
    
  } catch (error) {
    console.error('❌ Erro no login:', error);
    
    // ✅ LOG DE ERRO INTERNO
    await UserLog.criarLog({
      userId: null,
      acao: 'login_failed',
      detalhes: `Erro interno no login: ${error.message}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      usuarioInfo: null,
      sucesso: false,
      erro: error.message
    });
    
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ REFRESH TOKEN
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token não fornecido'
      });
    }
    
    // ✅ VERIFICAR REFRESH TOKEN
    const decoded = jwt.verify(
      refreshToken, 
      process.env.JWT_REFRESH_SECRET || 'your-refresh-secret'
    );
    
    // ✅ BUSCAR USUÁRIO
    const user = await User.findById(decoded.id);
    
    if (!user || !user.refreshTokens.includes(refreshToken)) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token inválido'
      });
    }
    
    // ✅ VERIFICAR SE USUÁRIO AINDA ESTÁ ATIVO
    if (!user.isActive && !user.ativo) {
      return res.status(401).json({
        success: false,
        message: 'Usuário desativado'
      });
    }
    
    // ✅ GERAR NOVO ACCESS TOKEN
    const newAccessToken = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );
    
    res.json({
      success: true,
      token: newAccessToken,
      expiresIn: '24h'
    });
    
  } catch (error) {
    console.error('❌ Erro no refresh token:', error);
    res.status(401).json({
      success: false,
      message: 'Refresh token inválido'
    });
  }
});

// ✅ LOGOUT
router.post('/logout', auth, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    // ✅ REMOVER REFRESH TOKEN
    if (refreshToken) {
      const user = await User.findById(req.user._id);
      if (user) {
        user.refreshTokens = user.refreshTokens.filter(token => token !== refreshToken);
        await user.save();
      }
    }
    
    // ✅ LOG DO LOGOUT
    await UserLog.criarLog({
      userId: req.user._id,
      acao: 'logout',
      detalhes: 'Logout realizado',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      usuarioInfo: {
        nome: req.user.name,
        email: req.user.email,
        role: req.user.role
      }
    });
    
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

// ✅ ALTERAR PRÓPRIA SENHA
router.post('/change-password', auth, async (req, res) => {
  try {
    const { senhaAtual, novaSenha, confirmarSenha } = req.body;
    
    // ✅ VALIDAÇÕES
    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      return res.status(400).json({
        success: false,
        message: 'Todos os campos são obrigatórios'
      });
    }
    
    if (novaSenha !== confirmarSenha) {
      return res.status(400).json({
        success: false,
        message: 'Nova senha e confirmação não coincidem'
      });
    }
    
    if (novaSenha.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Nova senha deve ter pelo menos 6 caracteres'
      });
    }
    
    // ✅ BUSCAR USUÁRIO
    const user = await User.findById(req.user._id);
    
    // ✅ VERIFICAR SENHA ATUAL
    const isSenhaAtualCorreta = await user.comparePassword(senhaAtual);
    
    if (!isSenhaAtualCorreta) {
      await UserLog.criarLog({
        userId: user._id,
        acao: 'change_password',
        detalhes: 'Tentativa de alteração de senha com senha atual incorreta',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        usuarioInfo: {
          nome: user.name,
          email: user.email,
          role: user.role
        },
        sucesso: false
      });
      
      return res.status(400).json({
        success: false,
        message: 'Senha atual incorreta'
      });
    }
    
    // ✅ ATUALIZAR SENHA
    user.password = novaSenha; // Será hasheada pelo middleware
    await user.save();
    
    // ✅ INVALIDAR TODOS OS REFRESH TOKENS (forçar novo login)
    user.refreshTokens = [];
    await user.save();
    
    // ✅ LOG DA ALTERAÇÃO
    await UserLog.criarLog({
      userId: user._id,
      acao: 'change_password',
      detalhes: 'Senha alterada com sucesso',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      usuarioInfo: {
        nome: user.name,
        email: user.email,
        role: user.role
      }
    });
    
    res.json({
      success: true,
      message: 'Senha alterada com sucesso. Faça login novamente.'
    });
    
  } catch (error) {
    console.error('❌ Erro ao alterar senha:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ VERIFICAR TOKEN (para debug)
router.get('/verify', auth, async (req, res) => {
  try {
    const permissoes = getPermissions(req.user.role);
    const roleInfo = getRoleInfo(req.user.role);
    
    res.json({
      success: true,
      user: {
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        isActive: req.user.isActive,
        ativo: req.user.ativo,
        permissoes,
        roleInfo
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao verificar token:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;
