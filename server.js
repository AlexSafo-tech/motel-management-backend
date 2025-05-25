// server.js - VERSÃO SEGURA PARA TESTE
// Vamos adicionar rotas uma por uma para descobrir qual está causando erro

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

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    api: 'Motel Management System',
    version: '1.0.0',
    status: 'running',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    endpoints: {
      auth: '/api/auth',
      rooms: '/api/rooms',
      reservations: '/api/reservations'
    }
  });
});

// ✅ IMPORTAR ROTAS UMA POR VEZ PARA TESTAR
console.log('📋 Carregando rotas...');

try {
  const authRoutes = require('./routes/auth');
  app.use('/api/auth', authRoutes);
  console.log('✅ Rota auth carregada');
} catch (error) {
  console.error('❌ Erro ao carregar rota auth:', error.message);
}

try {
  const roomRoutes = require('./routes/rooms');
  app.use('/api/rooms', roomRoutes);
  console.log('✅ Rota rooms carregada');
} catch (error) {
  console.error('❌ Erro ao carregar rota rooms:', error.message);
}

try {
  const reservationRoutes = require('./routes/reservations');
  app.use('/api/reservations', reservationRoutes);
  console.log('✅ Rota reservations carregada');
} catch (error) {
  console.error('❌ Erro ao carregar rota reservations:', error.message);
}

// 🚨 COMENTEI AS OUTRAS ROTAS POR ENQUANTO
// Vamos adicionar uma por vez depois que essas 3 funcionarem

/*
try {
  const customerRoutes = require('./routes/customers');
  app.use('/api/customers', customerRoutes);
  console.log('✅ Rota customers carregada');
} catch (error) {
  console.error('❌ Erro ao carregar rota customers:', error.message);
}

try {
  const orderRoutes = require('./routes/orders');
  app.use('/api/orders', orderRoutes);
  console.log('✅ Rota orders carregada');
} catch (error) {
  console.error('❌ Erro ao carregar rota orders:', error.message);
}

try {
  const productRoutes = require('./routes/products');
  app.use('/api/products', productRoutes);
  console.log('✅ Rota products carregada');
} catch (error) {
  console.error('❌ Erro ao carregar rota products:', error.message);
}

try {
  const dashboardRoutes = require('./routes/dashboard');
  app.use('/api/dashboard', dashboardRoutes);
  console.log('✅ Rota dashboard carregada');
} catch (error) {
  console.error('❌ Erro ao carregar rota dashboard:', error.message);
}
*/

console.log('📋 Carregamento de rotas concluído');

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error('❌ Erro no servidor:', err.stack);
  res.status(500).json({
    message: 'Erro interno do servidor',
    error: process.env.NODE_ENV === 'production' ? {} : err.message
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    message: 'Rota não encontrada',
    path: req.originalUrl,
    method: req.method
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📡 API disponível em: http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 Status da API: http://localhost:${PORT}/api/status`);
});

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
