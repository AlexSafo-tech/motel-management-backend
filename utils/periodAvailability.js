// utils/periodAvailability.js - UTILITÁRIOS PARA DISPONIBILIDADE POR PERÍODO
const getDefaultAvailabilityByPeriod = (periodoId) => {
  const regrasNegocio = {
    // ✅ PERÍODOS CURTOS - Apenas para hoje
    '4h': { hoje: true, agendado: false },
    '6h': { hoje: true, agendado: false },
    '12h': { hoje: true, agendado: false },
    
    // ✅ PERÍODOS LONGOS - Para hoje e agendado
    'diaria': { hoje: true, agendado: true },
    'pernoite': { hoje: false, agendado: true }, // Apenas agendado
    
    // ✅ PERÍODOS PERSONALIZADOS - Padrão flexível
    'default': { hoje: true, agendado: true }
  };
  
  return regrasNegocio[periodoId] || regrasNegocio.default;
};

const validatePeriodAvailability = (disponibilidade) => {
  const erros = [];
  
  if (!disponibilidade || typeof disponibilidade !== 'object') {
    erros.push('Disponibilidade deve ser um objeto válido');
    return erros;
  }
  
  Object.entries(disponibilidade).forEach(([periodoId, config]) => {
    // ✅ Validar estrutura da configuração
    if (!config || typeof config !== 'object') {
      erros.push(`Configuração do período ${periodoId} deve ser um objeto`);
      return;
    }
    
    // ✅ Validar se pelo menos um contexto está ativo
    if (!config.hoje && !config.agendado) {
      erros.push(`Período ${periodoId} deve estar ativo para pelo menos um contexto (hoje ou agendado)`);
    }
    
    // ✅ Validar tipos de dados
    if (config.hoje !== undefined && typeof config.hoje !== 'boolean') {
      erros.push(`Campo 'hoje' do período ${periodoId} deve ser boolean`);
    }
    
    if (config.agendado !== undefined && typeof config.agendado !== 'boolean') {
      erros.push(`Campo 'agendado' do período ${periodoId} deve ser boolean`);
    }
    
    // ✅ Validar regras de negócio específicas
    if (periodoId === 'pernoite' && config.hoje) {
      console.warn(`⚠️ Pernoite normalmente não é oferecido para hoje, mas foi configurado assim para ${periodoId}`);
    }
    
    if (['4h', '6h'].includes(periodoId) && config.agendado) {
      console.warn(`⚠️ Período ${periodoId} normalmente não é oferecido para agendado, mas foi configurado assim`);
    }
    
    // ✅ Validar períodos muito longos para hoje
    if (['pernoite', 'fim_de_semana'].includes(periodoId) && config.hoje) {
      console.warn(`⚠️ Período ${periodoId} pode ser inadequado para reservas de hoje`);
    }
  });
  
  return erros;
};

const processDisponibilidadeParaBanco = (disponibilidadePorPeriodo) => {
  const periodosHoje = [];
  const periodosAgendado = [];
  const mapProcessado = new Map();
  
  if (!disponibilidadePorPeriodo) {
    return { periodosHoje, periodosAgendado, mapProcessado };
  }
  
  Object.entries(disponibilidadePorPeriodo).forEach(([periodoId, config]) => {
    const configProcessada = {
      hoje: config.hoje || false,
      agendado: config.agendado || false,
      availableFor: []
    };
    
    if (config.hoje) {
      periodosHoje.push(periodoId);
      configProcessada.availableFor.push('today');
    }
    
    if (config.agendado) {
      periodosAgendado.push(periodoId);
      configProcessada.availableFor.push('future');
    }
    
    mapProcessado.set(periodoId, configProcessada);
  });
  
  return { periodosHoje, periodosAgendado, mapProcessado };
};

const gerarConfiguracoesCompletas = (precosPorPeriodo, disponibilidadePorPeriodo) => {
  const configuracoesCompletas = new Map();
  
  // ✅ Combinar preços e disponibilidade
  const todosPeriodos = new Set([
    ...Object.keys(precosPorPeriodo || {}),
    ...Object.keys(disponibilidadePorPeriodo || {})
  ]);
  
  todosPeriodos.forEach(periodoId => {
    const preco = precosPorPeriodo?.[periodoId] || 0;
    const disponibilidade = disponibilidadePorPeriodo?.[periodoId] || getDefaultAvailabilityByPeriod(periodoId);
    
    configuracoesCompletas.set(periodoId, {
      ativo: preco > 0 && (disponibilidade.hoje || disponibilidade.agendado),
      preco: preco,
      hoje: disponibilidade.hoje || false,
      agendado: disponibilidade.agendado || false,
      availableFor: [
        ...(disponibilidade.hoje ? ['today'] : []),
        ...(disponibilidade.agendado ? ['future'] : [])
      ]
    });
  });
  
  return configuracoesCompletas;
};

const validarConsistenciaPrecoDisponibilidade = (precosPorPeriodo, disponibilidadePorPeriodo) => {
  const avisos = [];
  const erros = [];
  
  if (!precosPorPeriodo && !disponibilidadePorPeriodo) {
    return { avisos, erros };
  }
  
  // ✅ Verificar períodos com disponibilidade mas sem preço
  if (disponibilidadePorPeriodo) {
    Object.entries(disponibilidadePorPeriodo).forEach(([periodoId, config]) => {
      if ((config.hoje || config.agendado) && (!precosPorPeriodo?.[periodoId] || precosPorPeriodo[periodoId] <= 0)) {
        avisos.push(`Período ${periodoId} está disponível mas não tem preço definido`);
      }
    });
  }
  
  // ✅ Verificar períodos com preço mas sem disponibilidade
  if (precosPorPeriodo) {
    Object.entries(precosPorPeriodo).forEach(([periodoId, preco]) => {
      if (preco > 0) {
        const config = disponibilidadePorPeriodo?.[periodoId];
        if (!config || (!config.hoje && !config.agendado)) {
          avisos.push(`Período ${periodoId} tem preço mas não está disponível em nenhum contexto`);
        }
      }
    });
  }
  
  return { avisos, erros };
};

const aplicarRegrasNegocioPadrao = (periodoId, config = {}) => {
  const padroes = getDefaultAvailabilityByPeriod(periodoId);
  
  return {
    hoje: config.hoje !== undefined ? config.hoje : padroes.hoje,
    agendado: config.agendado !== undefined ? config.agendado : padroes.agendado,
    availableFor: []
  };
};

const formatarDisponibilidadeParaResposta = (roomType) => {
  const disponibilidade = {};
  
  if (roomType.disponibilidadePorPeriodo instanceof Map) {
    for (let [periodoId, config] of roomType.disponibilidadePorPeriodo) {
      disponibilidade[periodoId] = {
        hoje: config.hoje,
        agendado: config.agendado,
        availableFor: config.availableFor || [],
        preco: roomType.getPrecoPorPeriodo ? roomType.getPrecoPorPeriodo(periodoId) : 0
      };
    }
  } else if (roomType.disponibilidadePorPeriodo && typeof roomType.disponibilidadePorPeriodo === 'object') {
    Object.entries(roomType.disponibilidadePorPeriodo).forEach(([periodoId, config]) => {
      disponibilidade[periodoId] = {
        hoje: config.hoje,
        agendado: config.agendado,
        availableFor: config.availableFor || [],
        preco: roomType.getPrecoPorPeriodo ? roomType.getPrecoPorPeriodo(periodoId) : 0
      };
    });
  }
  
  return disponibilidade;
};

module.exports = {
  getDefaultAvailabilityByPeriod,
  validatePeriodAvailability,
  processDisponibilidadeParaBanco,
  gerarConfiguracoesCompletas,
  validarConsistenciaPrecoDisponibilidade,
  aplicarRegrasNegocioPadrao,
  formatarDisponibilidadeParaResposta
};