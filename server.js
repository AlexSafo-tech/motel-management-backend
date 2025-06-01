// server.js - ARQUIVO PRINCIPAL DO BACKEND - VERSÃO CORRIGIDA
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ MIDDLEWARE
app.use(cors({
  origin: '*', // Em produção, especificar domínios permitidos
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ✅ LOGGING MIDDLEWARE
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ✅ CONECTAR COM MONGODB
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pms-motel';
    const connection = await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ MongoDB conectado com sucesso');
    
    // ✅ DISPONIBILIZAR DB PARA AS ROTAS (NECESSÁRIO PARA PERIODS)
    app.locals.db = connection.connection.db;
    console.log('✅ Database disponibilizado para as rotas');
    
  } catch (error) {
    console.error('❌ Erro ao conectar MongoDB:', error);
    process.exit(1);
  }
};

// ✅ ROTAS PRINCIPAIS
// Rota de health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API funcionando',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Rota raiz
app.get('/', (req, res) => {
  const availableEndpoints = [
    '/api/auth',
    '/api/users',
    '/api/rooms',
    '/api/periods',      // ✅ ADICIONADO
    '/api/reservations',  
    '/api/customers',
    '/api/orders',
    '/api/products',
    '/api/dashboard'
  ];

  res.json({
    success: true,
    message: 'PMS Motel API',
    version: '1.0.0',
    availableEndpoints: availableEndpoints,
    documentation: '/api/docs'
  });
});

// ✅ REGISTRAR ROTAS DA API
try {
  // Rota de autenticação
  app.use('/api/auth', require('./routes/auth'));
  console.log('✅ Rota /api/auth registrada');

  // ✅ ROTA DE USUÁRIOS
  app.use('/api/users', require('./routes/users'));
  console.log('✅ Rota /api/users registrada');

  // ✅ ROTA DE QUARTOS
  app.use('/api/rooms', require('./routes/rooms'));
  console.log('✅ Rota /api/rooms registrada');

  // ✅ROTA DE TIPOS DE QUARTOS
  app.use('/api/room-types', require('./routes/roomTypes'));
   console.log('✅ Rota /api/room-types registrada');

  // ✅ NOVA ROTA DE PERÍODOS
  app.use('/api/periods', require('./routes/periods'));
  console.log('✅ Rota /api/periods registrada');

  // Outras rotas
  app.use('/api/reservations', require('./routes/reservations'));
  console.log('✅ Rota /api/reservations registrada');

  app.use('/api/customers', require('./routes/customers'));
  console.log('✅ Rota /api/customers registrada');

  app.use('/api/orders', require('./routes/orders'));
  console.log('✅ Rota /api/orders registrada');

  app.use('/api/products', require('./routes/products'));
  console.log('✅ Rota /api/products registrada');

  app.use('/api/dashboard', require('./routes/dashboard'));
  console.log('✅ Rota /api/dashboard registrada');

} catch (error) {
  console.error('❌ Erro ao registrar rotas:', error);
  
  // ✅ FALLBACK - Se não conseguir carregar as rotas, criar rotas básicas
  app.get('/api/rooms', (req, res) => {
    res.json({
      success: true,
      message: 'Rota de quartos funcionando (fallback)',
      data: { rooms: [], stats: {} }
    });
  });

  app.post('/api/rooms', (req, res) => {
    console.log('📦 Dados recebidos para criar quarto (fallback):', req.body);
    res.status(201).json({
      success: true,
      message: 'Quarto criado (simulação - fallback)',
      data: {
        id: 'fallback-' + Date.now(),
        ...req.body
      }
    });
  });

  // Fallback para períodos também
  app.get('/api/periods', (req, res) => {
    res.json({
      success: true,
      message: 'Rota de períodos funcionando (fallback)',
      data: []
    });
  });
}

// ✅ MIDDLEWARE DE ERRO 404
app.use('*', (req, res) => {
  const availableEndpoints = [
    '/api/auth',
    '/api/users',
    '/api/rooms',
    '/api/periods',      // ✅ ADICIONADO
    '/api/reservations',
    '/api/customers',  
    '/api/orders',
    '/api/products',
    '/api/dashboard'
  ];

  res.status(404).json({
    success: false,
    message: 'Rota não encontrada',
    method: req.method,
    path: req.originalUrl,
    availableEndpoints: availableEndpoints
  });
});

// ✅ MIDDLEWARE DE TRATAMENTO DE ERROS
app.use((error, req, res, next) => {
  console.error('❌ Erro no servidor:', error);
  
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Erro interno do servidor',
    error: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
});

// ✅ INICIAR SERVIDOR
const startServer = async () => {
  try {
    await connectDB();
    
    app.listen(PORT, () => {
      console.log('🚀 Servidor iniciado com sucesso!');
      console.log(`🌐 URL: http://localhost:${PORT}`);
      console.log(`🌐 URL Render: https://pousada-1hlt.onrender.com`);
      console.log('📋 Endpoints disponíveis:');
      console.log('    GET  / - Informações da API');
      console.log('    GET  /health - Health check');
      console.log('    POST /api/auth - Login');
      console.log('    GET  /api/users - Listar usuários');
      console.log('    GET  /api/rooms - Listar quartos');
      console.log('    POST /api/rooms - Criar quarto');
      console.log('    GET  /api/periods - Listar períodos');            // ✅ NOVO
      console.log('    POST /api/periods - Criar período');             // ✅ NOVO
      console.log('    POST /api/periods/calculate-price - Calcular preço'); // ✅ NOVO
      console.log('    GET  /api/reservations - Listar reservas');
      console.log('    POST /api/reservations - Criar reserva');
      console.log('    GET  /api/dashboard/overview - Estatísticas');
      console.log('🎯 Sistema PMS Motel online!');
    });
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
};

// ✅ TRATAMENTO DE SINAIS
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM recebido. Encerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT recebido. Encerrando servidor...');
  process.exit(0);
});

// ✅ INICIAR
startServer();

module.exports = app;
