// server.js - Arquivo principal do servidor do sistema de gestão de motel

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Conexão com MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/motel_db', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Conectado ao MongoDB com sucesso');
  } catch (error) {
    console.error('❌ Erro ao conectar ao MongoDB:', error.message);
    process.exit(1);
  }
};

// Conectar ao banco de dados
connectDB();

// Função para criar usuário administrador inicial
const createInitialAdmin = async () => {
  try {
    const User = require('./models/User');
    
    // Verificar se já existe um administrador
    const adminExists = await User.findOne({ role: 'admin' });
    
    if (!adminExists) {
      const adminUser = new User({
        name: 'Administrador',
        email: 'admin@motel.com',
        password: 'admin123',
        role: 'admin',
        permissions: {
          canManageUsers: true,
          canManageRooms: true,
          canManageReservations: true,
          canManageOrders: true,
          canManageInventory: true,
          canViewReports: true
        }
      });
      
      await adminUser.save();
      console.log('✅ Usuário administrador criado:');
      console.log('   Email: admin@motel.com');
      console.log('   Senha: admin123');
      console.log('   ⚠️  ALTERE A SENHA APÓS O PRIMEIRO LOGIN!');
    }
  } catch (error) {
    console.error('❌ Erro ao criar usuário administrador:', error);
  }
};

// Criar admin inicial após conectar ao banco
setTimeout(createInitialAdmin, 2000);

// Rotas básicas
app.get('/', (req, res) => {
  res.json({
    message: '🏨 Sistema de Gestão de Motel - API funcionando!',
    version: '1.0.0',
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

// Rota de health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// Rota de status da API
app.get('/api/status', (req, res) => {
  res.json({
    api: 'Motel Management System',
    version: '1.0.0',
    status: 'running',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    endpoints: {
      auth: '/api/auth',
      rooms: '/api/rooms',
      customers: '/api/customers',
      reservations: '/api/reservations',
      orders: '/api/orders',
      products: '/api/products',
      dashboard: '/api/dashboard'
    }
  });
});

// Importar e usar rotas
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const customerRoutes = require('./routes/customers');
const reservationRoutes = require('./routes/reservations');
const orderRoutes = require('./routes/orders');
const productRoutes = require('./routes/products');
const dashboardRoutes = require('./routes/dashboard');

// Configurar rotas
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/products', productRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error('❌ Erro no servidor:', err.stack);
  res.status(500).json({
    message: 'Erro interno do servidor',
    error: process.env.NODE_ENV === 'production' ? {} : err.message
  });
});

// Middleware para rotas não encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    message: 'Rota não encontrada',
    path: req.originalUrl,
    method: req.method
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📡 API disponível em: http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 Status da API: http://localhost:${PORT}/api/status`);
  console.log(`\n📚 Endpoints disponíveis:`);
  console.log(`   🔐 Autenticação: http://localhost:${PORT}/api/auth`);
  console.log(`   🏠 Quartos: http://localhost:${PORT}/api/rooms`);
  console.log(`   👥 Clientes: http://localhost:${PORT}/api/customers`);
  console.log(`   📅 Reservas: http://localhost:${PORT}/api/reservations`);
  console.log(`   🍽️ Pedidos: http://localhost:${PORT}/api/orders`);
  console.log(`   📦 Produtos: http://localhost:${PORT}/api/products`);
  console.log(`   📊 Dashboard: http://localhost:${PORT}/api/dashboard`);
});

// Tratamento de sinais para encerramento gracioso
process.on('SIGTERM', () => {
  console.log('🛑 Recebido SIGTERM, encerrando servidor...');
  mongoose.connection.close(() => {
    console.log('🔌 Conexão com MongoDB fechada');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Recebido SIGINT, encerrando servidor...');
  mongoose.connection.close(() => {
    console.log('🔌 Conexão com MongoDB fechada');
    process.exit(0);
  });
});

module.exports = app;