// createAdmin.js - Script para criar usuário admin no MongoDB
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function createAdminUser() {
  try {
    console.log('🔄 Conectando ao MongoDB...');
    
    // Conectar ao MongoDB usando a string de conexão do .env
    await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/motel_management');
    console.log('✅ Conectado ao MongoDB');

    console.log('🔍 Verificando se admin já existe...');
    
    // Verificar se já existe um admin
    const existingAdmin = await User.findOne({ email: 'admin@pmsmotel.com' });
    
    if (existingAdmin) {
      console.log('⚠️  Usuário admin já existe!');
      console.log('📧 Email:', existingAdmin.email);
      console.log('👤 Nome:', existingAdmin.name);
      console.log('👑 Role:', existingAdmin.role);
      console.log('✅ Status:', existingAdmin.isActive ? 'Ativo' : 'Inativo');
      
      // Se existir mas estiver inativo, ativar
      if (!existingAdmin.isActive) {
        existingAdmin.isActive = true;
        existingAdmin.ativo = true;
        await existingAdmin.save();
        console.log('🔄 Admin reativado!');
      }
      
      console.log('\n🚀 Você já pode fazer login com:');
      console.log('📧 Email: admin@pmsmotel.com');
      console.log('🔒 Senha: admin123');
      
      return;
    }

    console.log('👤 Criando usuário administrador...');
    
    // Criar novo usuário admin
    const adminUser = new User({
      name: 'Administrador',
      email: 'admin@pmsmotel.com',
      password: 'admin123', // O middleware pre-save vai fazer o hash automaticamente
      role: 'admin',
      isActive: true,
      ativo: true,
      // Definir todas as permissões para admin
      permissions: {
        canManageUsers: true,
        canManageRooms: true,
        canManageReservations: true,
        canManageOrders: true,
        canManageInventory: true,
        canViewReports: true
      },
      criadoPor: 'script-setup',
      avatar: '👑'
    });

    // Salvar no banco
    await adminUser.save();
    
    console.log('🎉 Usuário administrador criado com sucesso!');
    console.log('─'.repeat(50));
    console.log('📧 Email: admin@pmsmotel.com');
    console.log('🔒 Senha: admin123');
    console.log('👑 Role: admin');
    console.log('👤 Nome: Administrador');
    console.log('✅ Status: Ativo');
    console.log('🆔 ID:', adminUser._id);
    console.log('─'.repeat(50));
    console.log('\n🚀 AGORA VOCÊ JÁ PODE FAZER LOGIN NO APP!');
    console.log('\n📱 No seu app React Native:');
    console.log('   1. Use o botão "🔥 CONECTAR COM API REAL"');
    console.log('   2. Ou faça login direto com as credenciais acima');
    
  } catch (error) {
    console.error('❌ Erro ao criar usuário admin:', error);
    
    if (error.code === 11000) {
      console.log('⚠️  Usuário com este email já existe!');
    } else if (error.name === 'ValidationError') {
      console.log('⚠️  Erro de validação:', error.message);
    }
    
  } finally {
    // Fechar conexão
    await mongoose.connection.close();
    console.log('🔌 Conexão com MongoDB fechada');
    process.exit(0);
  }
}

// Função adicional para criar múltiplos usuários de teste
async function createTestUsers() {
  try {
    console.log('👥 Criando usuários de teste...');
    
    const testUsers = [
      {
        name: 'João Recepcionista',
        email: 'recepcao@pmsmotel.com',
        password: 'recepcao123',
        role: 'recepcionista',
        permissions: {
          canManageUsers: false,
          canManageRooms: true,
          canManageReservations: true,
          canManageOrders: true,
          canManageInventory: false,
          canViewReports: false
        }
      },
      {
        name: 'Maria Camareira',
        email: 'camareira@pmsmotel.com',
        password: 'camareira123',
        role: 'camareira',
        permissions: {
          canManageUsers: false,
          canManageRooms: true,
          canManageReservations: false,
          canManageOrders: false,
          canManageInventory: false,
          canViewReports: false
        }
      },
      {
        name: 'Carlos Cozinheiro',
        email: 'cozinha@pmsmotel.com',
        password: 'cozinha123',
        role: 'cozinha',
        permissions: {
          canManageUsers: false,
          canManageRooms: false,
          canManageReservations: false,
          canManageOrders: true,
          canManageInventory: true,
          canViewReports: false
        }
      }
    ];

    for (const userData of testUsers) {
      const existingUser = await User.findOne({ email: userData.email });
      
      if (!existingUser) {
        await User.create({
          ...userData,
          isActive: true,
          ativo: true,
          criadoPor: 'script-setup'
        });
        console.log(`✅ Criado: ${userData.name} (${userData.email})`);
      } else {
        console.log(`⚠️  Já existe: ${userData.email}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Erro ao criar usuários de teste:', error);
  }
}

// Função principal
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--with-test-users')) {
    console.log('🎯 Criando admin + usuários de teste...\n');
    await createAdminUser();
    await createTestUsers();
  } else {
    console.log('🎯 Criando apenas usuário admin...\n');
    await createAdminUser();
  }
}

// Executar script
if (require.main === module) {
  main();
}

module.exports = { createAdminUser, createTestUsers };
