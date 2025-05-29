// routes/setup.js - Endpoint temporário para setup inicial
const express = require('express');
const router = express.Router();
const User = require('../models/User');

// ⚠️ ENDPOINT TEMPORÁRIO - REMOVER APÓS USAR
router.post('/create-admin', async (req, res) => {
  try {
    console.log('🔄 Endpoint create-admin chamado...');
    
    // Verificar se já existe admin
    const existingAdmin = await User.findOne({ email: 'admin@pmsmotel.com' });
    
    if (existingAdmin) {
      return res.json({
        success: true,
        message: 'Admin já existe!',
        admin: {
          id: existingAdmin._id,
          name: existingAdmin.name,
          email: existingAdmin.email,
          role: existingAdmin.role,
          isActive: existingAdmin.isActive
        }
      });
    }

    // Criar admin
    const adminUser = new User({
      name: 'Administrador',
      email: 'admin@pmsmotel.com',
      password: 'admin123',
      role: 'admin',
      isActive: true,
      ativo: true,
      permissions: {
        canManageUsers: true,
        canManageRooms: true,
        canManageReservations: true,
        canManageOrders: true,
        canManageInventory: true,
        canViewReports: true
      },
      criadoPor: 'setup-endpoint',
      avatar: '👑'
    });

    await adminUser.save();

    console.log('✅ Admin criado via endpoint');

    res.json({
      success: true,
      message: 'Usuário admin criado com sucesso!',
      admin: {
        id: adminUser._id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role
      },
      credentials: {
        email: 'admin@pmsmotel.com',
        password: 'admin123'
      }
    });

  } catch (error) {
    console.error('❌ Erro ao criar admin via endpoint:', error);
    
    res.status(500).json({
      success: false,
      message: 'Erro ao criar admin',
      error: error.message
    });
  }
});

// Endpoint para verificar usuários existentes
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}, 'name email role isActive createdAt').limit(10);
    
    res.json({
      success: true,
      count: users.length,
      users: users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
