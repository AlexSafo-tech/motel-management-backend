// ===============================================
// 2. ENDPOINTS DO BACKEND (routes/users.js)
// ===============================================

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { verificarPermissao, criarLogAuditoria } = require('../middleware/auth');

const router = express.Router();

// ✅ LISTAR USUÁRIOS (COM PERMISSÕES)
router.get('/', verificarPermissao('usuarios.visualizar'), async (req, res) => {
  try {
    const usuarios = await User.find()
      .select('-senha') // Não retornar senha
      .populate('criadoPor', 'nomeCompleto email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: usuarios,
      total: usuarios.length
    });

  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ✅ CRIAR USUÁRIO
router.post('/', verificarPermissao('usuarios.criar'), async (req, res) => {
  try {
    const { 
      nomeCompleto, 
      email, 
      senha, 
      cpf, 
      telefone, 
      role, 
      permissoes 
    } = req.body;

    // Verificar se email já existe
    const emailExistente = await User.findOne({ email });
    if (emailExistente) {
      return res.status(400).json({
        success: false,
        message: 'Email já está em uso'
      });
    }

    // Verificar CPF se fornecido
    if (cpf) {
      const cpfExistente = await User.findOne({ cpf });
      if (cpfExistente) {
        return res.status(400).json({
          success: false,
          message: 'CPF já está em uso'
        });
      }
    }

    // Criptografar senha
    const senhaHash = await bcrypt.hash(senha, 12);

    // Criar usuário
    const novoUsuario = new User({
      nomeCompleto,
      email: email.toLowerCase(),
      senha: senhaHash,
      cpf,
      telefone,
      role,
      permissoes,
      criadoPor: req.user._id
    });

    await novoUsuario.save();

    // Log de auditoria
    await criarLogAuditoria(
      req.user._id,
      'usuario_criado',
      'usuario',
      novoUsuario._id,
      {
        usuario: nomeCompleto,
        email,
        role
      },
      req
    );

    // Retornar usuário sem senha
    const usuarioResposta = novoUsuario.toObject();
    delete usuarioResposta.senha;

    res.status(201).json({
      success: true,
      data: usuarioResposta,
      message: 'Usuário criado com sucesso!'
    });

  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ✅ ATUALIZAR USUÁRIO (COM PERMISSÕES)
router.put('/:id', verificarPermissao('usuarios.editar'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      nomeCompleto, 
      email, 
      cpf, 
      telefone, 
      role, 
      permissoes, 
      ativo 
    } = req.body;

    const usuario = await User.findById(id);
    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    // Salvar dados anteriores para auditoria
    const dadosAnteriores = {
      nomeCompleto: usuario.nomeCompleto,
      email: usuario.email,
      role: usuario.role,
      ativo: usuario.ativo
    };

    // Verificar email único
    if (email && email !== usuario.email) {
      const emailExistente = await User.findOne({ 
        email: email.toLowerCase(),
        _id: { $ne: id }
      });
      if (emailExistente) {
        return res.status(400).json({
          success: false,
          message: 'Email já está em uso'
        });
      }
    }

    // Verificar CPF único
    if (cpf && cpf !== usuario.cpf) {
      const cpfExistente = await User.findOne({ 
        cpf,
        _id: { $ne: id }
      });
      if (cpfExistente) {
        return res.status(400).json({
          success: false,
          message: 'CPF já está em uso'
        });
      }
    }

    // Atualizar campos
    if (nomeCompleto) usuario.nomeCompleto = nomeCompleto;
    if (email) usuario.email = email.toLowerCase();
    if (cpf !== undefined) usuario.cpf = cpf;
    if (telefone !== undefined) usuario.telefone = telefone;
    if (role) usuario.role = role;
    if (permissoes) usuario.permissoes = permissoes;
    if (ativo !== undefined) usuario.ativo = ativo;
    
    usuario.updatedAt = new Date();

    await usuario.save();

    // Log de auditoria
    await criarLogAuditoria(
      req.user._id,
      'usuario_atualizado',
      'usuario',
      usuario._id,
      {
        antes: dadosAnteriores,
        depois: {
          nomeCompleto: usuario.nomeCompleto,
          email: usuario.email,
          role: usuario.role,
          ativo: usuario.ativo
        }
      },
      req
    );

    // Retornar usuário sem senha
    const usuarioResposta = usuario.toObject();
    delete usuarioResposta.senha;

    res.json({
      success: true,
      data: usuarioResposta,
      message: 'Usuário atualizado com sucesso!'
    });

  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ✅ ALTERAR SENHA
router.patch('/:id/senha', verificarPermissao('usuarios.editar'), async (req, res) => {
  try {
    const { id } = req.params;
    const { senhaAtual, novaSenha } = req.body;

    const usuario = await User.findById(id);
    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    // Se não for o próprio usuário, verificar se é admin
    if (req.user._id.toString() !== id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Apenas o próprio usuário ou admin pode alterar a senha'
      });
    }

    // Verificar senha atual (exceto se for admin alterando outro usuário)
    if (req.user._id.toString() === id) {
      const senhaValida = await bcrypt.compare(senhaAtual, usuario.senha);
      if (!senhaValida) {
        return res.status(400).json({
          success: false,
          message: 'Senha atual incorreta'
        });
      }
    }

    // Criptografar nova senha
    const novaSenhaHash = await bcrypt.hash(novaSenha, 12);
    usuario.senha = novaSenhaHash;
    usuario.updatedAt = new Date();

    await usuario.save();

    // Log de auditoria
    await criarLogAuditoria(
      req.user._id,
      'senha_alterada',
      'usuario',
      usuario._id,
      {
        alteradoPor: req.user.nomeCompleto,
        usuario: usuario.nomeCompleto
      },
      req
    );

    res.json({
      success: true,
      message: 'Senha alterada com sucesso!'
    });

  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ✅ EXCLUIR USUÁRIO
router.delete('/:id', verificarPermissao('usuarios.excluir'), async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user._id.toString() === id) {
      return res.status(400).json({
        success: false,
        message: 'Você não pode excluir sua própria conta'
      });
    }

    const usuario = await User.findById(id);
    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    // Salvar dados para auditoria
    const dadosUsuario = {
      nomeCompleto: usuario.nomeCompleto,
      email: usuario.email,
      role: usuario.role
    };

    await User.findByIdAndDelete(id);

    // Log de auditoria
    await criarLogAuditoria(
      req.user._id,
      'usuario_excluido',
      'usuario',
      id,
      {
        usuarioExcluido: dadosUsuario
      },
      req
    );

    res.json({
      success: true,
      message: 'Usuário excluído com sucesso!'
    });

  } catch (error) {
    console.error('Erro ao excluir usuário:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ✅ OBTER ESTRUTURA DE PERMISSÕES DISPONÍVEIS
router.get('/permissions-structure', async (req, res) => {
  try {
    const estruturaPermissoes = {
      dashboard: {
        nome: 'Dashboard',
        icone: '📊',
        permissoes: {
          visualizar: 'Visualizar dashboard',
          relatorios: 'Acessar relatórios',
          estatisticas: 'Ver estatísticas avançadas'
        }
      },
      reservas: {
        nome: 'Reservas',
        icone: '📅',
        permissoes: {
          visualizar: 'Visualizar reservas',
          criar: 'Criar nova reserva',
          editar: 'Editar reservas',
          cancelar: 'Cancelar reservas',
          checkin: 'Fazer check-in',
          checkout: 'Fazer check-out',
          relatorios: 'Relatórios de reservas'
        }
      },
      pedidos: {
        nome: 'Pedidos',
        icone: '🍽️',
        permissoes: {
          visualizar: 'Visualizar pedidos',
          criar: 'Criar novos pedidos',
          editar: 'Editar pedidos',
          cancelar: 'Cancelar pedidos',
          controleEstoque: 'Controlar estoque',
          configurarCardapio: 'Configurar cardápio',
          relatorios: 'Relatórios de pedidos'
        }
      },
      quartos: {
        nome: 'Quartos',
        icone: '🏨',
        permissoes: {
          visualizar: 'Visualizar quartos',
          criar: 'Criar novos quartos',
          editar: 'Editar quartos',
          excluir: 'Excluir quartos',
          alterarStatus: 'Alterar status dos quartos',
          configuracoes: 'Configurações de quartos',
          manutencao: 'Gerenciar manutenção'
        }
      },
      produtos: {
        nome: 'Produtos',
        icone: '📦',
        permissoes: {
          visualizar: 'Visualizar produtos',
          criar: 'Criar novos produtos',
          editar: 'Editar produtos',
          excluir: 'Excluir produtos',
          gerenciarEstoque: 'Gerenciar estoque',
          configurarPrecos: 'Configurar preços',
          categorias: 'Gerenciar categorias'
        }
      },
      periodos: {
        nome: 'Períodos',
        icone: '⏰',
        permissoes: {
          visualizar: 'Visualizar períodos',
          criar: 'Criar novos períodos',
          editar: 'Editar períodos',
          excluir: 'Excluir períodos',
          configurarPrecos: 'Configurar preços por período'
        }
      },
      financeiro: {
        nome: 'Financeiro',
        icone: '💰',
        permissoes: {
          visualizar: 'Visualizar dados financeiros',
          relatorios: 'Gerar relatórios financeiros',
          faturamento: 'Gerenciar faturamento',
          despesas: 'Controlar despesas',
          exportar: 'Exportar dados financeiros'
        }
      },
      usuarios: {
        nome: 'Usuários',
        icone: '👥',
        permissoes: {
          visualizar: 'Visualizar usuários',
          criar: 'Criar novos usuários',
          editar: 'Editar usuários',
          excluir: 'Excluir usuários',
          gerenciarPermissoes: 'Gerenciar permissões',
          logs: 'Ver logs de auditoria'
        }
      },
      configuracoes: {
        nome: 'Configurações',
        icone: '⚙️',
        permissoes: {
          sistema: 'Configurações do sistema',
          backup: 'Gerenciar backups',
          integracao: 'Configurar integrações',
          personalização: 'Personalizar interface'
        }
      }
    };

    res.json({
      success: true,
      data: estruturaPermissoes
    });

  } catch (error) {
    console.error('Erro ao obter estrutura de permissões:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
