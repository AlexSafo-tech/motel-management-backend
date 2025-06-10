// routes/users.js - CORRIGIDO: Importações e funções corretas
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

// ✅ GET /api/users - Listar usuários
router.get('/', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { page = 1, limit = 10, search, role, isActive } = req.query;
    
    // Construir filtros
    const filters = {};
    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    if (role) filters.role = role;
    if (isActive !== undefined) filters.isActive = isActive === 'true';

    // Executar consulta
    const users = await User.find(filters)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(filters);

    res.json({
      success: true,
      data: {
        users,
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

// ✅ GET /api/users/:id - Obter usuário específico
router.get('/:id', authenticate, checkOwnershipOrAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    res.json({
      success: true,
      data: { user }
    });

  } catch (error) {
    console.error('Erro ao obter usuário:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ POST /api/users - Criar usuário
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, email, password, role = 'user', permissions = {} } = req.body;

    // Validações
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

    // Criar usuário
    const user = new User({
      name,
      email: email.toLowerCase(),
      password,
      role,
      permissions,
      isActive: true,
      isVerified: true
    });

    await user.save();

    // Retornar usuário sem senha
    const userResponse = user.toObject();
    delete userResponse.password;

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

// ✅ PUT /api/users/:id - Atualizar usuário
router.put('/:id', authenticate, checkOwnershipOrAdmin, async (req, res) => {
  try {
    const { name, email, role, permissions, isActive } = req.body;
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

    // Atualizar campos
    if (name) user.name = name;
    if (email) user.email = email.toLowerCase();
    if (role && req.user.role === 'admin') user.role = role; // Só admin pode mudar role
    if (permissions && req.user.role === 'admin') user.permissions = permissions;
    if (isActive !== undefined && req.user.role === 'admin') user.isActive = isActive;

    await user.save();

    // Retornar usuário sem senha
    const userResponse = user.toObject();
    delete userResponse.password;

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

// ✅ PATCH /api/users/:id/activate - Ativar/desativar usuário
router.patch('/:id/activate', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { isActive } = req.body;
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    user.isActive = isActive;
    await user.save();

    res.json({
      success: true,
      message: `Usuário ${isActive ? 'ativado' : 'desativado'} com sucesso`,
      data: { 
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          isActive: user.isActive
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

// ✅ POST /api/users/:id/change-password - Mudar senha
router.post('/:id/change-password', authenticate, checkOwnershipOrAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.params.id;

    if (!newPassword) {
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
    if (req.user.role !== 'admin' && currentPassword) {
      const isCurrentPasswordValid = await user.comparePassword(currentPassword);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Senha atual incorreta'
        });
      }
    }

    // Atualizar senha
    user.password = newPassword;
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
