// A visão consolidada da diária: um take, os três departamentos, relacionados por
// `take_id` (Fase 8 — production-room.md §6).
//
// É o cruzamento que a plataforma existe para entregar. Se ele errar, o editor recebe o
// arquivo de som casado com o clip errado — e descobre semanas depois.
import {
  filtraLinhas,
  lacunasDoDia,
  linhasConsolidadas,
} from '@/features/diaria/consolidado.ts';
import { exportaDiaria, nomeDoArquivo } from '@/features/diaria/export.ts';

const checks = [];
const ok = (name, cond) => checks.push({ name, pass: !!cond });

const base = { productionId: 'p', version: 0, _dirty: 0 };

const cena = (id, number, block) => ({ ...base, id, number, block });
const plano = (id, sceneId, code, sortOrder = 0) => ({
  ...base,
  id,
  sceneId,
  shootingDayId: 'd',
  code,
  sortOrder,
});
const take = (id, setupId, number, kind = 'SYNC') => ({
  ...base,
  id,
  setupId,
  number,
  status: 'RECORDED',
  kind,
});

const fonte = {
  cenas: [cena('c24a', '24', 'A'), cena('c31', '31', 'A')],
  setups: [plano('p1', 'c24a', '1'), plano('p2', 'c31', '1')],
  takes: [
    take('t1', 'p1', 1),
    take('t2', 'p1', 2),
    take('t3', 'p1', 3, 'MOS'),
    take('t4', 'p2', 1),
    take('t5', 'p2', 2),
  ],
  cameras: [
    { ...base, id: 'camA', label: 'A' },
    { ...base, id: 'camB', label: 'B' },
  ],
  camera: [
    {
      ...base,
      id: 'ct1',
      takeId: 't1',
      cameraUnitId: 'camA',
      card: 'A023',
      fileName: 'A023C012_001',
      approved: true,
      status: 'CIRCLE',
    },
    // Multicam de verdade: duas linhas para o mesmo take.
    {
      ...base,
      id: 'ct1b',
      takeId: 't1',
      cameraUnitId: 'camB',
      card: 'B011',
      fileName: 'B011C004_001',
      approved: false,
    },
    { ...base, id: 'ct2', takeId: 't2', cameraUnitId: 'camA', card: 'A023', approved: false },
    { ...base, id: 'ct3', takeId: 't3', cameraUnitId: 'camA', card: 'A023', approved: false },
  ],
  som: [
    {
      ...base,
      id: 's1',
      takeId: 't1',
      soundRoll: '008',
      fileName: '008_012',
      circled: true,
      status: 'CIRCLE',
    },
    // O take 4 tem som e não tem câmera: o som chegou primeiro (playback, wild).
    { ...base, id: 's4', takeId: 't4', soundRoll: '008', fileName: '008_013', circled: false },
  ],
  continuidade: [
    { ...base, id: 'k1', takeId: 't1', selected: true, status: 'CIRCLE', action: 'João entra' },
  ],
};

const linhas = linhasConsolidadas(fonte);

// ---- A junção ----

ok('todo take da diária vira uma linha', linhas.length === 5);
ok(
  'a ordem é cena, bloco, plano, take',
  linhas.map((l) => `${l.cena}/${l.take}`).join(',') === '24/1,24/2,24/3,31/1,31/2',
);

const completo = linhas[0];
// É o cruzamento que o editor abre a diária para fazer — e aqui ele é uma junção por
// `take_id`, não uma conciliação.
ok('o clip da câmera chega na linha', completo.camera.arquivo.includes('A023C012_001'));
ok('o arquivo do som chega na MESMA linha', completo.som.arquivo === '008_012');
ok('o cartão e o roll aparecem juntos', completo.camera.midia.includes('A023') && completo.som.midia === '008');
ok('a continuidade chega na mesma linha', completo.continuidade.nota.includes('João entra'));

// Mostrar só a primeira câmera esconderia metade do material de um take de duas câmeras.
ok('multicam não perde a segunda câmera', completo.camera.arquivo.includes('B011C004_001'));
ok('o rótulo da câmera acompanha o arquivo', completo.camera.arquivo.startsWith('A '));
ok('o cartão da segunda câmera também entra', completo.camera.midia.includes('B011'));
ok('cartão repetido não aparece duas vezes', completo.camera.midia.split('A023').length === 2);

ok('aprovado vira destaque na coluna da câmera', completo.camera.destaque === true);
ok('circled vira destaque na coluna do som', completo.som.destaque === true);
ok('print vira destaque na coluna da continuidade', completo.continuidade.destaque === true);

const semNinguem = linhas.find((l) => l.take === 2 && l.cena === '31');
ok(
  'take que ninguém anotou fica visível, com as três colunas vazias',
  semNinguem.camera.anotou === false &&
    semNinguem.som.anotou === false &&
    semNinguem.continuidade.anotou === false,
);

const mos = linhas.find((l) => l.take === 3);
ok('o take MOS é marcado', mos.mos === true && mos.natureza === 'MOS');
ok('o take normal não tem natureza impressa', linhas[0].natureza === '');

// ---- O que falta ----

const lacunas = lacunasDoDia(linhas);

ok('conta o take que ninguém anotou', lacunas.semNinguem === 1);
// A pergunta que, com três cadernos separados, só se responde no dia seguinte.
ok('conta o take com câmera e sem som', lacunas.semSom === 1);
// MOS é take que declaradamente não tem áudio: confundir os dois desfaria ADR-029.
ok(
  'o take MOS NÃO conta como sem som',
  linhas.filter((l) => l.camera.anotou && !l.som.anotou).length === 2 &&
    lacunas.semSom === 1,
);
ok('conta o take com som e sem câmera', lacunas.semCamera === 1);
ok('conta o que ninguém da continuidade anotou', lacunas.semContinuidade === 3);

// ---- Busca local ----

ok('busca por cartão acha o take', filtraLinhas(linhas, 'A023').length === 3);
ok('busca por arquivo de som acha um take', filtraLinhas(linhas, '008_012').length === 1);
ok('busca é insensível a maiúsculas', filtraLinhas(linhas, 'a023c012_001').length === 1);
ok('busca por cena com bloco funciona', filtraLinhas(linhas, '24A').length === 3);
ok('busca por nota de continuidade funciona', filtraLinhas(linhas, 'joão').length === 1);
// Digitar duas palavras restringe, não amplia: "24 boom" é o take da cena 24 com boom.
ok('cada palavra do termo precisa aparecer', filtraLinhas(linhas, 'A023 008_012').length === 1);
ok('termo sem correspondência não devolve nada', filtraLinhas(linhas, 'inexistente').length === 0);
ok('termo vazio devolve tudo', filtraLinhas(linhas, '   ').length === 5);

// ---- Diária vazia ----

const vazia = linhasConsolidadas({
  cenas: [],
  setups: [],
  takes: [],
  camera: [],
  cameras: [],
  som: [],
  continuidade: [],
});
ok('diária vazia não gera linha', vazia.length === 0);
ok('lacunas de diária vazia são zero', lacunasDoDia(vazia).semSom === 0);

// ---- O JSON da diária (Fase 9) ----
//
// O arquivo que sobra quando a produção acaba. Ele guarda entidades cruas, não a leitura
// consolidada: resumo a gente refaz, dado perdido não.

const cabecalho = {
  producao: { name: 'Ação Entre Amigos', company: 'X Filmes', director: 'A', dop: 'B' },
  diaria: {
    date: '2026-08-19',
    dayNumber: '12',
    callTime: '07:00',
    wrapTime: '19:00',
    lunchStart: null,
    lunchEnd: null,
    location: 'Galpão',
    unit: null,
    notes: null,
  },
  equipe: [{ id: 'm1', nome: 'Ana', funcao: 'Câmera' }],
  equipamentos: [
    { id: 'e1', departamento: 'CAMERA', categoria: 'MEDIA', descricao: 'SanDisk' },
  ],
};

const arquivo = exportaDiaria(
  {
    cabecalho,
    cenas: fonte.cenas,
    setups: fonte.setups,
    takes: fonte.takes,
    cameras: fonte.cameras,
    camera: fonte.camera,
    somConfig: { ...base, id: 'cfg', shootingDayId: 'd', sampleRate: '48000' },
    som: fonte.som,
    somTracks: [{ ...base, id: 'tr1', takeId: 't1', index: 1, name: 'Boom' }],
    continuidade: fonte.continuidade,
    props: [{ ...base, id: 'pr1', sceneId: 'c24a' }],
    figurino: [],
    cabeloMaquiagem: [],
    cenografia: [],
    relatorio: { ...base, id: 'rel', shootingDayId: 'd' },
  },
  '2026-08-19T22:00:00.000Z',
);

ok('o arquivo se identifica', arquivo.app === 'boletim-audiovisual');
ok('o arquivo declara a versão do formato', arquivo.schemaVersion === 1);
ok('a data da exportação é a informada', arquivo.exportedAt === '2026-08-19T22:00:00.000Z');
ok('o cabeçalho da sala vai junto', arquivo.producao.name === 'Ação Entre Amigos');
ok('a diária vai por inteiro', arquivo.diaria.date === '2026-08-19');
ok('a equipe vai junto', arquivo.equipe.length === 1);
ok('o equipamento alocado vai junto', arquivo.equipamentos.length === 1);

// Entidades cruas: cena, plano e take saem como estão, não resumidos.
ok('as cenas vão cruas', arquivo.cenas.length === fonte.cenas.length);
ok('os planos vão crus', arquivo.setups.length === fonte.setups.length);
ok('os takes vão crus', arquivo.takes.length === fonte.takes.length);
ok('as câmeras cadastradas vão junto', arquivo.camera.unidades.length === 2);
ok('os dados de câmera vão junto', arquivo.camera.takes.length === fonte.camera.length);
ok('a configuração de som vai junto', arquivo.som.configuracao !== null);
ok('as tracks vão junto', arquivo.som.tracks.length === 1);
ok('a continuidade vai junto', arquivo.continuidade.takes.length === fonte.continuidade.length);
ok('as coleções de estado vão junto', arquivo.continuidade.props.length === 1);
ok('o relatório de progresso vai junto', arquivo.continuidade.relatorioDeProgresso !== null);

// `_dirty` é contabilidade deste aparelho: fora dele, não significa nada.
ok(
  'o marcador de pendência local não sai no arquivo',
  !JSON.stringify(arquivo).includes('_dirty'),
);
// `version` fica: ela é do servidor, e é o que permite reconhecer o registro depois.
ok('a versão do servidor fica', 'version' in arquivo.takes[0]);

ok(
  'os totais conferem sem abrir o arquivo inteiro',
  arquivo.totais.takes === fonte.takes.length && arquivo.totais.planos === fonte.setups.length,
);

// Diária que ninguém preencheu ainda exporta — o arquivo é do dia, não dos takes.
const arquivoVazio = exportaDiaria(
  {
    cabecalho,
    cenas: [],
    setups: [],
    takes: [],
    cameras: [],
    camera: [],
    som: [],
    somTracks: [],
    continuidade: [],
    props: [],
    figurino: [],
    cabeloMaquiagem: [],
    cenografia: [],
  },
  '2026-08-19T22:00:00.000Z',
);
ok('diária vazia ainda exporta', arquivoVazio.totais.takes === 0);
ok(
  'sem configuração de som o campo é nulo, não ausente',
  arquivoVazio.som.configuracao === null,
);
ok(
  'sem relatório de progresso o campo é nulo',
  arquivoVazio.continuidade.relatorioDeProgresso === null,
);

ok(
  'o nome do arquivo perde acento e espaço',
  nomeDoArquivo('Ação Entre Amigos', '2026-08-19') ===
    'diaria-acao-entre-amigos-2026-08-19.json',
);
ok(
  'produção sem nome não gera arquivo sem nome',
  nomeDoArquivo('  ', '2026-08-19') === 'diaria-sem-titulo-2026-08-19.json',
);

let failed = 0;
for (const c of checks) {
  if (!c.pass) failed++;
  console.log(`${c.pass ? '✓' : '✗'} ${c.name}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passaram.`);
process.exit(failed === 0 ? 0 : 1);
