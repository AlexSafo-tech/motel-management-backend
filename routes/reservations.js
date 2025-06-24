// ✅ FUNÇÃO DE EMERGÊNCIA - ADICIONAR NO INÍCIO DE routes/reservations.js
const buscarPeriodosDoMongo = async () => {
  try {
    console.log('🚨 [EMERGÊNCIA] Buscando períodos...');
    
    // Importar modelo
    let Period;
    try {
      Period = require('../models/Period');
      console.log('✅ Modelo Period importado');
    } catch (error) {
      console.error('❌ Erro ao importar Period:', error.message);
      // FALLBACK IMEDIATO
      return {
        periodNameMap: {
          '4h': '4 HORAS',
          '6h': '6 HORAS', 
          '12h': '12 HORAS',
          'daily': 'DIÁRIA',
          'pernoite': 'PERNOITE'
        },
        priceMap: {
          '4h': 55.00,
          '6h': 70.00,
          '12h': 90.00, 
          'daily': 120.00,
          'pernoite': 100.00
        },
        enumValidos: ['4h', '6h', '12h', 'daily', 'pernoite'],
        periodos: []
      };
    }
    
    // Testar conexão MongoDB
    console.log('📡 Estado MongoDB:', mongoose.connection.readyState);
    
    // Buscar TODOS os períodos primeiro
    const todosPeriodos = await Period.find({});
    console.log(`📊 Total períodos no banco: ${todosPeriodos.length}`);
    
    if (todosPeriodos.length === 0) {
      console.error('❌ NENHUM período encontrado no MongoDB!');
      // FALLBACK IMEDIATO
      return {
        periodNameMap: {
          '4h': '4 HORAS',
          '6h': '6 HORAS',
          '12h': '12 HORAS', 
          'daily': 'DIÁRIA',
          'pernoite': 'PERNOITE'
        },
        priceMap: {
          '4h': 55.00,
          '6h': 70.00,
          '12h': 90.00,
          'daily': 120.00, 
          'pernoite': 100.00
        },
        enumValidos: ['4h', '6h', '12h', 'daily', 'pernoite'],
        periodos: []
      };
    }
    
    // Mostrar estrutura dos períodos
    console.log('🔍 Estrutura dos períodos:');
    todosPeriodos.slice(0, 3).forEach(p => {
      console.log('📋 Período:', JSON.stringify({
        _id: p._id,
        periodType: p.periodType || p.id,
        periodName: p.periodName || p.nome,
        basePrice: p.basePrice || p.preco,
        active: p.active || p.ativo
      }, null, 2));
    });
    
    // Criar mapeamentos baseado no que existe
    const periodNameMap = {};
    const priceMap = {};
    const enumValidos = [];
    
    todosPeriodos.forEach(periodo => {
      // Detectar campos dinamicamente
      const tipo = periodo.periodType || periodo.id;
      const nome = periodo.periodName || periodo.nome || tipo.toUpperCase();
      const preco = periodo.basePrice || periodo.preco || 50;
      const ativo = periodo.active !== false && periodo.ativo !== false;
      
      if (tipo && ativo) {
        periodNameMap[tipo] = nome;
        priceMap[tipo] = preco;
        enumValidos.push(tipo);
        console.log(`✅ Período ativo: ${tipo} → ${nome} (R$ ${preco})`);
      } else {
        console.log(`⚠️ Período inativo: ${tipo}`);
      }
    });
    
    console.log(`✅ ${enumValidos.length} períodos ativos mapeados`);
    
    return {
      periodNameMap,
      priceMap,
      enumValidos,
      periodos: todosPeriodos
    };
    
  } catch (error) {
    console.error('❌ ERRO CRÍTICO na busca:', error);
    
    // FALLBACK FINAL
    return {
      periodNameMap: {
        '4h': '4 HORAS',
        '6h': '6 HORAS',
        '12h': '12 HORAS',
        'daily': 'DIÁRIA', 
        'pernoite': 'PERNOITE'
      },
      priceMap: {
        '4h': 55.00,
        '6h': 70.00,
        '12h': 90.00,
        'daily': 120.00,
        'pernoite': 100.00
      },
      enumValidos: ['4h', '6h', '12h', 'daily', 'pernoite'],
      periodos: []
    };
  }
};
