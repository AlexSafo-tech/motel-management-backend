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
    '/api/room-types',   // ✅ ADICIONADO
    '/api/periods',      // ✅ ADICIONADO
    '/api/reservations',  
    '/api/customers',
    '/api/orders',
    '/api/products',
    '/api/dashboard',
    '/debug/room-types'  // ✅ ADICIONADO
  ];

  res.json({
    success: true,
    message: 'PMS Motel API',
    version: '1.0.0',
    availableEndpoints: availableEndpoints,
    documentation: '/api/docs'
  });
});

// ✅ ROTA DE DEBUG - MOVIDA PARA AQUI (ANTES DAS OUTRAS ROTAS)
app.get('/debug/room-types', async (req, res) => {
  try {
    console.log('🔍 Rota de debug /debug/room-types chamada');
    
    const RoomType = require('./models/RoomType');
    console.log('📦 Modelo RoomType carregado');
    
    // Buscar TODOS os tipos (ativos e inativos)
    const allTypes = await RoomType.find({});
    console.log(`📊 Total de tipos encontrados: ${allTypes.length}`);
    
    // Buscar apenas ativos
    const activeTypes = await RoomType.find({ 'disponibilidade.ativo': true });
    console.log(`📊 Tipos ativos encontrados: ${activeTypes.length}`);
    
    // Testar método personalizado
    let methodTest = null;
    try {
      methodTest = await RoomType.findAtivos();
      console.log(`🧪 Método findAtivos retornou: ${methodTest?.length || 0} tipos`);
    } catch (error) {
      console.log(`❌ Erro no método findAtivos: ${error.message}`);
      methodTest = { error: error.message };
    }
    
    // Verificar estrutura dos dados
    const sampleType = allTypes[0];
    console.log('📋 Estrutura do primeiro tipo:', sampleType ? {
      id: sampleType.id,
      nome: sampleType.nome,
      disponibilidade: sampleType.disponibilidade,
      precosPorPeriodo: sampleType.precosPorPeriodo,
      _id: sampleType._id
