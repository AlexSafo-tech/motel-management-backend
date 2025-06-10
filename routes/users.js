// routes/users.js - CORRIGIDO PARA COMPATIBILIDADE COM MONGODB REAL

const express = require('express');
const router = express.Router();
const User = require('../models/User');

// ✅ IMPORTAR CORRETAMENTE AS FUNÇÕES DO MIDDLEWARE
const { 
  authenticate, 
  authorize, 
  checkPermission,
  checkOwnershipOrAdmin 
} = require('../middleware/auth');

// ✅ GET /api/users - Listar usuários (CORRIGIDO PARA MONGODB REAL)
router.get('/', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { page = 1, limit = 10, search, role, ativo } = req.query;
    
    // Construir filtros compatíveis com MongoDB real
    const filters = {};
    if (search) {
      filters.$or = [
        { nomeCompleto: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    if (role) filters.role = role;
    if (ativo !== undefined) filters.ativo = ativo === 'true';

    // Executar consulta
    const users = await User.find(filters)
      .select('-password -senha')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(filters);

    // ✅ MAPEAR DADOS PARA FORMATO ESPERADO PELO FRONTEND
    const mappedUsers = users.map(user => ({
      id: user._id,
      name: user.nomeCompleto || user.name || 'Usuário',
      email: user.email,
      role: user.role,
      isActive: user.ativo || user.isActive || false,
      avatar: user.avatar || '👤',
      permissions: user.permissoes || user.permissions || {},
      lastLogin: user.ultimoLogin || user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }));

    res.json({
      success: true,
      data: {
        users: mappedUsers,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ GET /api/users/:id - Obter usuário específico (CORRIGIDO)
router.get('/:id', authenticate, checkOwnershipOrAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -senha');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    // ✅ MAPEAR DADOS PARA FORMATO ESPERADO
    const mappedUser = {
      id: user._id,
      name: user.nomeCompleto || user.name || 'Usuário',
      email: user.email,
      role: user.role,
      isActive: user.ativo || user.isActive || false,
      avatar: user.avatar || '👤',
      permissions: user.permissoes || user.permissions || {},
      lastLogin: user.ultimoLogin || user.lastLogin,
      cpf: user.cpf,
      telefone: user.telefone,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    res.json({
      success: true,
      data: { user: mappedUser }
    });

  } catch (error) {
    console.error('Erro ao obter usuário:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ POST /api/users - Criar usuário (CORRIGIDO)
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, nomeCompleto, email, password, senha, role = 'funcionario', permissions, permissoes } = req.body;

    // Validações flexíveis
    const userName = nomeCompleto || name;
    const userPassword = senha || password;
    
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

    // ✅ CRIAR USUÁRIO COM CAMPOS COMPATÍVEIS
    const userData = {
      nomeCompleto: userName,
      email: email.toLowerCase(),
      senha: userPassword,
      role,
      ativo: true,
      permissoes: permissoes || permissions || {},
      avatar: '👤'
    };

    const user = new User(userData);
    await user.save();

    // ✅ MAPEAR RESPOSTA
    const userResponse = {
      id: user._id,
      name: user.nomeCompleto,
      email: user.email,
      role: user.role,
      isActive: user.ativo,
      avatar: user.avatar,
      permissions: user.permissoes,
      createdAt: user.createdAt
    };

    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso',
      data: { user: userResponse }
    });

  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ PUT /api/users/:id - Atualizar usuário (CORRIGIDO)
router.put('/:id', authenticate, checkOwnershipOrAdmin, async (req, res) => {
  try {
    const { name, nomeCompleto, email, role, permissions, permissoes, isActive, ativo } = req.body;
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    // Verificar se email já existe (se mudou)
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ 
        email: email.toLowerCase(),
        _id: { $ne: userId }
      });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email já está em uso por outro usuário'
        });
      }
    }

    // ✅ ATUALIZAR CAMPOS COMPATÍVEIS
    if (nomeCompleto || name) user.nomeCompleto = nomeCompleto || name;
    if (email) user.email = email.toLowerCase();
    if (role && req.user.role === 'admin') user.role = role;
    if ((permissoes || permissions) && req.user.role === 'admin') {
      user.permissoes = permissoes || permissions;
    }
    if ((ativo !== undefined || isActive !== undefined) && req.user.role === 'admin') {
      user.ativo = ativo !== undefined ? ativo : isActive;
    }

    await user.save();

    // ✅ MAPEAR RESPOSTA
    const userResponse = {
      id: user._id,
      name: user.nomeCompleto,
      email: user.email,
      role: user.role,
      isActive: user.ativo,
      avatar: user.avatar,
      permissions: user.permissoes,
      updatedAt: user.updatedAt
    };

    res.json({
      success: true,
      message: 'Usuário atualizado com sucesso',
      data: { user: userResponse }
    });

  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ DELETE /api/users/:id - Deletar usuário
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const userId = req.params.id;

    // Não permitir que admin delete a si mesmo
    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Você não pode deletar sua própria conta'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    await User.findByIdAndDelete(userId);

    res.json({
      success: true,
      message: 'Usuário deletado com sucesso'
    });

  } catch (error) {
    console.error('Erro ao deletar usuário:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ PATCH /api/users/:id/activate - Ativar/desativar usuário (CORRIGIDO)
router.patch('/:id/activate', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { isActive, ativo } = req.body;
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    // ✅ USAR CAMPO CORRETO DO MONGODB
    const activeStatus = ativo !== undefined ? ativo : isActive;
    user.ativo = activeStatus;
    await user.save();

    res.json({
      success: true,
      message: `Usuário ${activeStatus ? 'ativado' : 'desativado'} com sucesso`,
      data: { 
        user: {
          id: user._id,
          name: user.nomeCompleto,
          email: user.email,
          isActive: user.ativo
        }
      }
    });

  } catch (error) {
    console.error('Erro ao ativar/desativar usuário:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ POST /api/users/:id/change-password - Mudar senha (CORRIGIDO)
router.post('/:id/change-password', authenticate, checkOwnershipOrAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword, senhaNova, senhaAtual } = req.body;
    const userId = req.params.id;

    // Flexibilidade nos nomes dos campos
    const newPass = newPassword || senhaNova;
    const currentPass = currentPassword || senhaAtual;

    if (!newPass) {
      return res.status(400).json({
        success: false,
        message: 'Nova senha é obrigatória'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    // Se não for admin, verificar senha atual
    if (req.user.role !== 'admin' && currentPass) {
      const bcrypt = require('bcrypt');
      const currentPasswordField = user.senha || user.password;
      const isCurrentPasswordValid = await bcrypt.compare(currentPass, currentPasswordField);
      
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Senha atual incorreta'
        });
      }
    }

    // Atualizar senha (usar campo que existir)
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(newPass, 10);
    
    if (user.senha !== undefined) {
      user.senha = hashedPassword;
    } else {
      user.password = hashedPassword;
    }
    
    await user.save();

    res.json({
      success: true,
      message: 'Senha alterada com sucesso'
    });

  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;
