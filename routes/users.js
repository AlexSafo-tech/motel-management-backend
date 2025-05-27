// routes/users.js - CRUD completo para gestão de usuários
const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const UserLog = require('../models/UserLog');
const auth = require('../middleware/auth');
const { checkPermission, adminOnly, ROLE_INFO } = require('../middleware/permissions');

const router = express.Router();

// ✅ LISTAR USUÁRIOS (Admin apenas)
router.get('/', auth, checkPermission('usuarios.gerenciar'), async (req, res) => {
  try {
    console.log('📋 Listando usuários...');
    
    const { page = 1, limit = 50, search, role, ativo } = req.query;
    
    // ✅ CONSTRUIR FILTROS
    const filters = {};
    
    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (role) {
      filters.role = role;
    }
    
    if (ativo !== undefined) {
      filters.isActive = ativo === 'true';
    }
    
    // ✅ BUSCAR USUÁRIOS
    const users = await User.find(filters)
      .select('-password -refreshTokens')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
    
    const total = await User.countDocuments(filters);
    
    // ✅ LOG DA AÇÃO
    await UserLog.criarLog({
      userId: req.user._id,
      acao: 'list_users',
      detalhes: `Listou ${users.length} usuários`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      usuarioInfo: {
        nome: req.user.name,
        email: req.user.email,
        role: req.user.role
      },
      metadados: { total, filtros: filters }
    });
    
    res.json({
      success: true,
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao listar usuários:', error);
    
    await UserLog.criarLog({
      userId: req.user._id,
      acao: 'list_users',
      detalhes: 'Erro ao listar usuários',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      usuarioInfo: {
        nome: req.user.name,
        email: req.user.email,
        role: req.user.role
      },
      sucesso: false,
      erro: error.message
    });
    
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ OBTER USUÁRIO POR ID (Admin apenas)
router.get('/:id', auth, checkPermission('usuarios.gerenciar'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -refreshTokens');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }
    
    res.json({
      success: true,
      data: user
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar usuário:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ CRIAR USUÁRIO (Admin apenas)
router.post('/', auth, checkPermission('usuarios.gerenciar'), async (req, res) => {
  try {
    const { name, email, password, role, ativo, telefone, observacoes } = req.body;
    
    console.log('➕ Criando usuário:', { name, email, role });
    
    // ✅ VALIDAÇÕES
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Nome, email e senha são obrigatórios'
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Senha deve ter pelo menos 6 caracteres'
      });
    }
    
    // ✅ VERIFICAR SE EMAIL JÁ EXISTE
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email já está em uso'
      });
    }
    
    // ✅ VALIDAR ROLE
    const validRoles = ['admin', 'recepcionista', 'camareira', 'cozinha'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Nível de acesso inválido'
      });
    }
    
    // ✅ CRIAR USUÁRIO
    const userData = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password, // Será hasheado pelo middleware pre('save')
      role: role || 'recepcionista',
      isActive: ativo !== false,
      ativo: ativo !== false,
      criadoPor: req.user._id.toString(),
      telefone,
      observacoes
    };
    
    const user = new User(userData);
    await user.save();
    
    // ✅ LOG DA AÇÃO
    await UserLog.criarLog({
      userId: req.user._id,
      acao: 'create_user',
      detalhes: `Usuário ${name} criado com role ${role || 'recepcionista'}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      usuarioInfo: {
        nome: req.user.name,
        email: req.user.email,
        role: req.user.role
      },
      metadados: {
        novoUsuarioId: user._id,
        novoUsuarioEmail: user.email,
        novoUsuarioRole: user.role
      }
    });
    
    // ✅ RESPOSTA SEM SENHA
    const userResponse = user.toJSON();
    
    res.status(201).json({
      success: true,
      data: userResponse,
      message: 'Usuário criado com sucesso'
    });
    
    console.log('✅ Usuário criado:', user.email);
    
  } catch (error) {
    console.error('❌ Erro ao criar usuário:', error);
    
    await UserLog.criarLog({
      userId: req.user._id,
      acao: 'create_user',
      detalhes: `Erro ao criar usuário: ${req.body.email}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      usuarioInfo: {
        nome: req.user.name,
        email: req.user.email,
        role: req.user.role
      },
      sucesso: false,
      erro: error.message
    });
    
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ EDITAR USUÁRIO (Admin apenas)
router.put('/:id', auth, checkPermission('usuarios.gerenciar'), async (req, res) => {
  try {
    const { name, email, password, role, ativo, telefone, observacoes } = req.body;
    const userId = req.params.id;
    
    console.log('✏️ Editando usuário:', userId);
    
    // ✅ BUSCAR USUÁRIO
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }
    
    // ✅ VERIFICAR EMAIL DUPLICADO (SE MUDOU)
    if (email && email.toLowerCase() !== user.email) {
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
    
    // ✅ ATUALIZAR CAMPOS
    const dadosAtualizacao = {};
    
    if (name) dadosAtualizacao.name = name.trim();
    if (email) dadosAtualizacao.email = email.toLowerCase().trim();
    if (role) dadosAtualizacao.role = role;
    if (ativo !== undefined) {
      dadosAtualizacao.isActive = ativo;
      dadosAtualizacao.ativo = ativo;
    }
    if (telefone !== undefined) dadosAtualizacao.telefone = telefone;
    if (observacoes !== undefined) dadosAtualizacao.observacoes = observacoes;
    
    // ✅ ATUALIZAR SENHA SE FORNECIDA
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Senha deve ter pelo menos 6 caracteres'
        });
      }
      dadosAtualizacao.password = password; // Será hasheada pelo middleware
    }
    
    // ✅ APLICAR ATUALIZAÇÕES
    Object.assign(user, dadosAtualizacao);
    await user.save();
    
    // ✅ LOG DA AÇÃO
    await UserLog.criarLog({
      userId: req.user._id,
      acao: 'edit_user',
      detalhes: `Usuário ${user.name} editado`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      usuarioInfo: {
        nome: req.user.name,
        email: req.user.email,
        role: req.user.role
      },
      metadados: {
        usuarioEditadoId: user._id,
        camposAlterados: Object.keys(dadosAtualizacao)
      }
    });
    
    res.json({
      success: true,
      data: user.toJSON(),
      message: 'Usuário atualizado com sucesso'
    });
    
    console.log('✅ Usuário editado:', user.email);
    
  } catch (error) {
    console.error('❌ Erro ao editar usuário:', error);
    
    await UserLog.criarLog({
      userId: req.user._id,
      acao: 'edit_user',
      detalhes: `Erro ao editar usuário: ${req.params.id}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      usuarioInfo: {
        nome: req.user.name,
        email: req.user.email,
        role: req.user.role
      },
      sucesso: false,
      erro: error.message
    });
    
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ EXCLUIR USUÁRIO (Admin apenas)
router.delete('/:id', auth, checkPermission('usuarios.gerenciar'), async (req, res) => {
  try {
    const userId = req.params.id;
    
    console.log('🗑️ Excluindo usuário:', userId);
    
    // ✅ NÃO PERMITIR EXCLUIR PRÓPRIA CONTA
    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Não é possível excluir sua própria conta'
      });
    }
    
    // ✅ BUSCAR USUÁRIO
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }
    
    // ✅ EXCLUIR USUÁRIO
    await User.findByIdAndDelete(userId);
    
    // ✅ LOG DA AÇÃO
    await UserLog.criarLog({
      userId: req.user._id,
      acao: 'delete_user',
      detalhes: `Usuário ${user.name} (${user.email}) excluído`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      usuarioInfo: {
        nome: req.user.name,
        email: req.user.email,
        role: req.user.role
      },
      metadados: {
        usuarioExcluidoId: user._id,
        usuarioExcluidoEmail: user.email,
        usuarioExcluidoRole: user.role
      }
    });
    
    res.json({
      success: true,
      message: 'Usuário excluído com sucesso'
    });
    
    console.log('✅ Usuário excluído:', user.email);
    
  } catch (error) {
    console.error('❌ Erro ao excluir usuário:', error);
    
    await UserLog.criarLog({
      userId: req.user._id,
      acao: 'delete_user',
      detalhes: `Erro ao excluir usuário: ${req.params.id}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      usuarioInfo: {
        nome: req.user.name,
        email: req.user.email,
        role: req.user.role
      },
      sucesso: false,
      erro: error.message
    });
    
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ ALTERAR STATUS ATIVO/INATIVO (Admin apenas)
router.patch('/:id/status', auth, checkPermission('usuarios.gerenciar'), async (req, res) => {
  try {
    const { ativo } = req.body;
    const userId = req.params.id;
    
    console.log('🔄 Alterando status do usuário:', userId, 'para:', ativo);
    
    // ✅ NÃO PERMITIR DESATIVAR PRÓPRIA CONTA
    if (userId === req.user._id.toString() && !ativo) {
      return res.status(400).json({
        success: false,
        message: 'Não é possível desativar sua própria conta'
      });
    }
    
    // ✅ ATUALIZAR STATUS
    const user = await User.findByIdAndUpdate(
      userId,
      { 
        isActive: ativo,
        ativo: ativo
      },
      { new: true }
    ).select('-password -refreshTokens');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }
    
    // ✅ LOG DA AÇÃO
    await UserLog.criarLog({
      userId: req.user._id,
      acao: 'change_status',
      detalhes: `Status do usuário ${user.name} alterado para ${ativo ? 'ativo' : 'inativo'}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      usuarioInfo: {
        nome: req.user.name,
        email: req.user.email,
        role: req.user.role
      },
      metadados: {
        usuarioAlteradoId: user._id,
        novoStatus: ativo
      }
    });
    
    res.json({
      success: true,
      data: user,
      message: `Usuário ${ativo ? 'ativado' : 'desativado'} com sucesso`
    });
    
  } catch (error) {
    console.error('❌ Erro ao alterar status:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ ALTERAR NÍVEL DE ACESSO (Admin apenas)
router.patch('/:id/role', auth, checkPermission('usuarios.gerenciar'), async (req, res) => {
  try {
    const { role, motivo } = req.body;
    const userId = req.params.id;
    
    console.log('🔄 Alterando role do usuário:', userId, 'para:', role);
    
    // ✅ VALIDAR ROLE
    const validRoles = ['admin', 'recepcionista', 'camareira', 'cozinha'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Nível de acesso inválido'
      });
    }
    
    // ✅ BUSCAR E ATUALIZAR USUÁRIO
    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true }
    ).select('-password -refreshTokens');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }
    
    // ✅ LOG DA AÇÃO
    await UserLog.criarLog({
      userId: req.user._id,
      acao: 'change_role',
      detalhes: `Role do usuário ${user.name} alterado para ${role}. Motivo: ${motivo || 'Não informado'}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      usuarioInfo: {
        nome: req.user.name,
        email: req.user.email,
        role: req.user.role
      },
      metadados: {
        usuarioAlteradoId: user._id,
        novoRole: role,
        motivo
      }
    });
    
    res.json({
      success: true,
      data: user,
      message: 'Nível de acesso atualizado com sucesso'
    });
    
  } catch (error) {
    console.error('❌ Erro ao alterar role:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ OBTER ESTATÍSTICAS DE USUÁRIOS (Admin apenas)
router.get('/stats/overview', auth, checkPermission('usuarios.gerenciar'), async (req, res) => {
  try {
    console.log('📊 Obtendo estatísticas de usuários...');
    
    // ✅ ESTATÍSTICAS BÁSICAS
    const totalUsuarios = await User.countDocuments();
    const usuariosAtivos = await User.countDocuments({ isActive: true });
    const usuariosInativos = totalUsuarios - usuariosAtivos;
    
    // ✅ ESTATÍSTICAS POR ROLE
    const porNivel = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const porNivelFormatado = {};
    porNivel.forEach(item => {
      porNivelFormatado[item._id] = item.count;
    });
    
    // ✅ LOGINS RECENTES
    const ultimasSemana = new Date();
    ultimasSemana.setDate(ultimasSemana.getDate() - 7);
    
    const loginsRecentes = await User.countDocuments({
      lastLogin: { $gte: ultimasSemana }
    });
    
    // ✅ NOVOS USUÁRIOS NO MÊS
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    
    const novosMes = await User.countDocuments({
      createdAt: { $gte: inicioMes }
    });
    
    // ✅ ÚLTIMO LOGIN
    const ultimoLogin = await User.findOne({
      lastLogin: { $exists: true }
    }).sort({ lastLogin: -1 }).select('lastLogin');
    
    const stats = {
      totalUsuarios,
      usuariosAtivos,
      usuariosInativos,
      porNivel: porNivelFormatado,
      loginsUltimaSemana: loginsRecentes,
      novosMes,
      ultimoLogin: ultimoLogin?.lastLogin || null
    };
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    console.error('❌ Erro ao obter estatísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ OBTER LOGS DE ATIVIDADE (Admin apenas)
router.get('/logs/activity', auth, checkPermission('usuarios.gerenciar'), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      userId, 
      acao, 
      startDate, 
      endDate,
      sucesso 
    } = req.query;
    
    // ✅ CONSTRUIR FILTROS
    const filtros = {};
    
    if (userId) filtros.userId = userId;
    if (acao) filtros.acao = acao;
    if (sucesso !== undefined) filtros.sucesso = sucesso === 'true';
    
    if (startDate || endDate) {
      filtros.timestamp = {};
      if (startDate) filtros.timestamp.$gte = new Date(startDate);
      if (endDate) filtros.timestamp.$lte = new Date(endDate);
    }
    
    // ✅ BUSCAR LOGS
    const logs = await UserLog.find(filtros)
      .populate('userId', 'name email role')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
    
    const total = await UserLog.countDocuments(filtros);
    
    res.json({
      success: true,
      data: logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao obter logs:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;
