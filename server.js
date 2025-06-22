// server.js - ATUALIZADO COM SUPORTE A restaurant_products
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
    '/api/room-types',
    '/api/periods',
    '/api/reservations',  
    '/api/customers',
    '/api/orders',
    '/api/products',              // ✅ PERÍODOS DE QUARTOS
    '/api/restaurant-products',   // ✅ NOVO - PRODUTOS DE COZINHA
    '/api/productcategories',
    '/api/dashboard',
    '/debug/room-types'
  ];

  res.json({
    success: true,
    message: 'PMS Motel API',
    version: '1.0.0',
    availableEndpoints: availableEndpoints,
    documentation: '/api/docs',
    collections: {
      products: 'Períodos de quartos (2h, 4h, pernoite)',
      restaurant_products: 'Produtos de cozinha (cervejas, pratos, bebidas)'
    }
  });
});

// ✅ ROTA TEMPORÁRIA PARA MIGRAR DADOS
app.post('/debug/migrate-room-types', async (req, res) => {
  try {
    const RoomType = require('./models/RoomType');
    const migrados = await RoomType.migrarCampoAtivo();
    
    res.json({
      success: true,
      message: `${migrados} tipos migrados com sucesso`,
      migrados: migrados
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ ROTA DE DEBUG
app.get('/debug/room-types', async (req, res) => {
  try {
    console.log('🔍 Rota de debug /debug/room-types chamada');
    
    const RoomType = require('./models/RoomType');
    console.log('📦 Modelo RoomType carregado');
    
    const allTypes = await RoomType.find({});
    console.log(`📊 Total de tipos encontrados: ${allTypes.length}`);
    
    const activeTypes = await RoomType.find({ 'disponibilidade.ativo': true });
    console.log(`📊 Tipos ativos encontrados: ${activeTypes.length}`);
    
    let methodTest = null;
    try {
      methodTest = await RoomType.findAtivos();
      console.log(`🧪 Método findAtivos retornou: ${methodTest?.length || 0} tipos`);
    } catch (error) {
      console.log(`❌ Erro no método findAtivos: ${error.message}`);
      methodTest = { error: error.message };
    }
    
    const sampleType = allTypes[0];
    console.log('📋 Estrutura do primeiro tipo:', sampleType ? {
      id: sampleType.id,
      nome: sampleType.nome,
      disponibilidade: sampleType.disponibilidade,
      precosPorPeriodo: sampleType.precosPorPeriodo,
      _id: sampleType._id
    } : 'Nenhum tipo encontrado');
    
    res.json({
      success: true,
      debug: {
        totalTypes: allTypes.length,
        activeTypes: activeTypes.length,
        allTypes: allTypes.map(t => ({
          id: t.id,
          nome: t.nome,
          ativo: t.disponibilidade?.ativo,
          precosPorPeriodo: t.precosPorPeriodo,
          createdAt: t.createdAt,
          _id: t._id
        })),
        activeTypesData: activeTypes.slice(0, 2),
        methodTest: methodTest,
        sampleType: sampleType
      }
    });
    
  } catch (error) {
    console.error('❌ Erro na rota debug:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// ✅ NOVA ROTA DEBUG PARA RESTAURANT_PRODUCTS
app.get('/debug/restaurant-products', async (req, res) => {
  try {
    console.log('🍽️ [DEBUG] Verificando collection restaurant_products...');
    
    const { RestaurantProduct, RestaurantCategory } = require('./models/RestaurantProduct');
    
    const products = await RestaurantProduct.find({}).populate('categoria');
    const categories = await RestaurantCategory.find({});
    
    console.log(`📊 [DEBUG] Produtos do restaurante: ${products.length}`);
    console.log(`📂 [DEBUG] Categorias do restaurante: ${categories.length}`);
    
    res.json({
      success: true,
      debug: {
        totalProducts: products.length,
        totalCategories: categories.length,
        products: products.slice(0, 5).map(p => ({
          id: p._id,
          nome: p.nome,
          categoria: p.categoria?.name,
          tipo: p.tipo,
          variacoes: p.variacoes.length,
          ativo: p.ativo
        })),
        categories: categories.map(c => ({
          id: c._id,
          name: c.name,
          icon: c.icon,
          order: c.order,
          isActive: c.isActive
        }))
      }
    });
    
  } catch (error) {
    console.error('❌ [DEBUG] Erro:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
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

  // ✅ ROTA DE TIPOS DE QUARTOS
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

  // ✅ ROTA DE PRODUCTS (AGORA SÓ PERÍODOS)
  app.use('/api/products', require('./routes/products'));
  console.log('✅ Rota /api/products registrada (períodos de quartos)');

  // ✅ NOVA ROTA DE RESTAURANT-PRODUCTS (PRODUTOS DE COZINHA)
  app.use('/api/restaurant-products', require('./routes/restaurant'));
  console.log('✅ Rota /api/restaurant-products registrada (produtos de cozinha)');

  // ✅ ROTA DE CATEGORIAS DE PRODUTOS
  app.use('/api/productcategories', require('./routes/productCategories'));
  console.log('✅ Rota /api/productcategories registrada');

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

  // Fallback para períodos
  app.get('/api/periods', (req, res) => {
    res.json({
      success: true,
      message: 'Rota de períodos funcionando (fallback)',
      data: []
    });
  });

  // ✅ FALLBACK PARA RESTAURANT-PRODUCTS
  app.get('/api/restaurant-products', (req, res) => {
    res.json({
      success: true,
      message: 'Rota de produtos do restaurante funcionando (fallback)',
      data: [],
      info: 'Instale a rota restaurant.js para funcionalidade completa'
    });
  });
}

// ✅ MIDDLEWARE DE ERRO 404
app.use('*', (req, res) => {
  const availableEndpoints = [
    '/api/auth',
    '/api/users',
    '/api/rooms',
    '/api/room-types',
    '/api/periods',
    '/api/reservations',
    '/api/customers',  
    '/api/orders',
    '/api/products',              // Períodos de quartos
    '/api/restaurant-products',   // ✅ NOVO - Produtos de cozinha
    '/api/productcategories',
    '/api/dashboard',
    '/debug/room-types',
    '/debug/restaurant-products'  // ✅ NOVO DEBUG
  ];

  res.status(404).json({
    success: false,
    message: 'Rota não encontrada',
    method: req.method,
    path: req.originalUrl,
    availableEndpoints: availableEndpoints,
    suggestion: req.originalUrl.includes('restaurant') 
      ? 'Para produtos de cozinha, use /api/restaurant-products'
      : req.originalUrl.includes('products')
      ? 'Para períodos de quartos, use /api/products. Para produtos de cozinha, use /api/restaurant-products'
      : null
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
      console.log('    GET  /debug/room-types - Debug tipos');
      console.log('    GET  /debug/restaurant-products - Debug produtos restaurante'); // ✅ NOVO
      console.log('    POST /api/auth - Login');
      console.log('    GET  /api/users - Listar usuários');
      console.log('    GET  /api/rooms - Listar quartos');
      console.log('    POST /api/rooms - Criar quarto');
      console.log('    GET  /api/room-types - Listar tipos');
      console.log('    POST /api/room-types - Criar tipo');
      console.log('    POST /api/room-types/init - Init tipos');
      console.log('    GET  /api/periods - Listar períodos');
      console.log('    POST /api/periods - Criar período');
      console.log('    POST /api/periods/calculate-price - Calcular preço');
      console.log('    GET  /api/reservations - Listar reservas');
      console.log('    POST /api/reservations - Criar reserva');
      console.log('    GET  /api/products - Listar produtos (PERÍODOS)');           // ✅ CLARIFICADO
      console.log('    GET  /api/restaurant-products - Listar produtos COZINHA');   // ✅ NOVO
      console.log('    POST /api/restaurant-products - Criar produto COZINHA');     // ✅ NOVO
      console.log('    PUT  /api/restaurant-products/:id - Editar produto COZINHA'); // ✅ NOVO
      console.log('    DELETE /api/restaurant-products/:id - Deletar produto COZINHA'); // ✅ NOVO
      console.log('    GET  /api/productcategories - Listar categorias');
      console.log('    POST /api/productcategories - Criar categoria');
      console.log('    GET  /api/dashboard/overview - Estatísticas');
      console.log('🎯 Sistema PMS Motel online!');
      console.log('');
      console.log('📋 SEPARAÇÃO DE DADOS:');
      console.log('  🏨 /api/products → Períodos de quartos (2h, 4h, pernoite)');
      console.log('  🍽️ /api/restaurant-products → Produtos de cozinha (cervejas, pratos)');
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
