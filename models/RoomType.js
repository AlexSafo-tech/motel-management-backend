// ✅ CORREÇÃO DO MÉTODO findAtivos() no models/RoomType.js

// SUBSTITUA os métodos estáticos por estes:

// ✅ MÉTODOS ESTÁTICOS CORRIGIDOS
roomTypeSchema.statics.findAtivos = function() {
  // ✅ BUSCAR POR AMBOS OS CAMPOS PARA COMPATIBILIDADE
  return this.find({ 
    $or: [
      { 'disponibilidade.ativo': true },  // Formato novo
      { 'ativo': true }                   // Formato antigo (do seu banco)
    ]
  }).sort({ ordem: 1, nome: 1 });
};

// ✅ COMPATIBILIDADE: Manter findActive para código antigo
roomTypeSchema.statics.findActive = function() {
  return this.findAtivos();
};

roomTypeSchema.statics.findComPrecos = function() {
  return this.find({ 
    $or: [
      { 'disponibilidade.ativo': true },
      { 'ativo': true }
    ],
    $or: [
      { precosPorPeriodo: { $exists: true, $ne: {} } },
      { precosBase: { $exists: true, $ne: {} } }
    ]
  }).sort({ ordem: 1 });
};

// ✅ MÉTODO PARA MIGRAR DADOS (USAR UMA VEZ PARA CORRIGIR O BANCO)
roomTypeSchema.statics.migrarCampoAtivo = async function() {
  try {
    console.log('🔄 Migrando campo ativo para disponibilidade.ativo...');
    
    const tipos = await this.find({});
    let migrados = 0;
    
    for (const tipo of tipos) {
      if (tipo.ativo !== undefined && !tipo.disponibilidade?.ativo) {
        // Migrar ativo para disponibilidade.ativo
        if (!tipo.disponibilidade) {
          tipo.disponibilidade = {};
        }
        tipo.disponibilidade.ativo = tipo.ativo;
        
        await tipo.save();
        migrados++;
        console.log(`✅ Migrado: ${tipo.nome}`);
      }
    }
    
    console.log(`✅ ${migrados} tipos migrados com sucesso`);
    return migrados;
  } catch (error) {
    console.error('❌ Erro na migração:', error);
    throw error;
  }
};
