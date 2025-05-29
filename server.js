// server.js - ARQUIVO PRINCIPAL DO BACKEND
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const setupRoutes = require('./routes/setup'); // <<<<====== ADICIONADO AQUI

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
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB conectado com sucesso');
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
    '/api/users', // Adicionando users aqui também se for um endpoint principal
    '/api/rooms',
    '/api/reservations',  
    '/api/customers',
    '/api/orders',
    '/api/products',
    '/api/dashboard',
    '/api/setup' // Adicionando a nova rota para informação
  ];

  res.json({
    success: true,
    message: 'PMS Motel API',
    version: '1.0.0',
    availableEndpoints: availableEndpoints,
    documentation: '/api/docs' // Se você tiver uma rota de documentação
  });
});

// ✅ REGISTRAR ROTAS DA API
try {
  // Rota de autenticação
  app.use('/api/auth', require('./routes/auth'));
  console.log('✅ Rota /api/auth registrada');

  // ✅ ROTA DE USUÁRIOS - IMPORTANTE!
  app.use('/api/users', require('./routes/users'));
  console.log('✅ Rota /api/users registrada');

  // ✅ ROTA DE QUARTOS - IMPORTANTE!
  app.use('/api/rooms', require('./routes/rooms'));
  console.log('✅ Rota /api/rooms registrada');

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

  // ⚠️ IMPORTANTE: Esta é uma rota temporária apenas para criar o primeiro admin
  // Remova após usar!
  app.use('/api/setup', setupRoutes); // <<<<====== ADICIONADO AQUI
  console.log('✅ Rota /api/setup registrada (TEMPORÁRIA)');


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
}

// ✅ MIDDLEWARE DE ERRO 404
app.use('*', (req, res) => {
  const availableEndpoints = [ // Manter atualizado ou gerar dinamicamente se possível
    '/api/auth',
    '/api/users',
    '/api/rooms',
    '/api/reservations',
    '/api/customers',  
    '/api/orders',
    '/api/products',
    '/api/dashboard',
    '/api/setup' // Adicionar também aqui
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
      console.log(`🌐 URL Render: https://pousada-1hlt.onrender.com`); // Verifique se esta URL é a correta do seu deploy
      console.log('📋 Endpoints disponíveis:');
      console.log('    GET  / - Informações da API');
      console.log('    GET  /health - Health check');
      console.log('    POST /api/auth/login - Login');
      console.log('    GET  /api/users - Listar usuários (se aplicável)');
      console.log('    GET  /api/rooms - Listar quartos');
      console.log('    POST /api/rooms - Criar quarto');
      console.log('    GET  /api/reservations - Listar reservas');
      console.log('    POST /api/reservations - Criar reserva');
      console.log('    GET  /api/dashboard/stats - Estatísticas');
      console.log('    GET  /api/setup/create-admin - Criar admin (TEMPORÁRIO - se for este o endpoint)'); // Exemplo
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
