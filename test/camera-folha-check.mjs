// A estrutura do Boletim de Câmera: agrupamento Cena → Bloco, linha técnica do plano,
// diferenças por take e assinatura de agrupamento (ADR-011, ADR-030).
//
// É o que a tela e a folha impressa leem em comum. Testar aqui é testar as duas: se o
// agrupamento divergir, o PDF mostra uma diária diferente da que foi preenchida.
import {
  agrupaCenas,
  assinaturaDoPlano,
  CAMPOS_TECNICOS,
  diferencasDoPlano,
  linhasDoBoletim,
  partesTecnicas,
  resumoDeMidia,
  rotuloDoJulgamento,
  rotuloDoTipo,
} from '@/features/camera/estrutura.ts';
import {
  colunasDoCSV,
  montaCSV,
  nomeDoArquivo,
} from '@/features/camera/csv.ts';
import {
  equipamentosDoDepartamento,
  suportesDeMidia,
} from '@/features/diaria/equipamentos.ts';

const checks = [];
const ok = (name, cond) => checks.push({ name, pass: !!cond });

const cena = (id, number, block) => ({ id, number, block, productionId: 'p', version: 0, _dirty: 0 });

// ---- Agrupamento Cena → Bloco ----

const agrupadas = agrupaCenas([
  cena('c2', '24', 'B'),
  cena('c1', '24', 'A'),
  cena('c3', '3', 'A'),
  cena('c4', '105', 'A'),
]);

ok('cenas distintas viram um grupo cada', agrupadas.length === 3);
ok(
  'a ordem é numérica, não alfabética',
  agrupadas.map((c) => c.numero).join(',') === '3,24,105',
);
ok(
  'os blocos da mesma cena ficam juntos',
  agrupadas.find((c) => c.numero === '24').blocos.length === 2,
);
ok(
  'os blocos saem em ordem de letra',
  agrupadas
    .find((c) => c.numero === '24')
    .blocos.map((b) => b.block)
    .join('') === 'AB',
);
ok('cena sem bloco não some', agrupaCenas([cena('c5', '9', null)]).length === 1);
ok('lista vazia não gera cena', agrupaCenas([]).length === 0);

// ---- Linha técnica do plano ----

const plano = {
  id: 'd1',
  iso: '800',
  fps: '24',
  tStop: 'T2.8',
  lens: 'Cooke 32mm',
  codec: 'ProRes 4444',
  shutter: '',
  whiteBalance: null,
  matteBox: true,
};

const partes = partesTecnicas(plano);

ok('campo vazio não entra na linha', !partes.some((p) => p === ''));
ok('campo nulo não entra na linha', partes.length === 6);
ok('o ISO é rotulado', partes.includes('ISO 800'));
ok('o frame rate é rotulado', partes.includes('24 fps'));
ok('o diafragma sai como está', partes.includes('T2.8'));
ok('o matte box aparece como marca', partes.includes('Matte Box'));
ok(
  'a ordem é a do boletim: formato antes da óptica',
  partes.indexOf('ProRes 4444') < partes.indexOf('Cooke 32mm'),
);
ok('plano sem dados não tem linha técnica', partesTecnicas(undefined).length === 0);

// ---- Diferenças de um take em relação ao plano ----

const take3 = { ...plano, id: 'd3', tStop: 'T4', iso: '1600' };
const take4 = { ...plano, id: 'd4', tStop: 'T4', iso: '1600' };
const take2 = { ...plano, id: 'd2' };

const mudou = diferencasDoPlano(take3, plano);
ok('só os campos alterados aparecem', mudou.length === 2);
ok('o valor novo é o impresso', mudou.includes('T4') && mudou.includes('ISO 1600'));
ok('take igual ao plano não tem diferença', diferencasDoPlano(take2, plano).length === 0);
ok('o próprio plano não difere de si mesmo', diferencasDoPlano(plano, plano).length === 0);
// Comparação contra o **primeiro** take, não contra o anterior: senão o take 4, que
// herdou o T4 do take 3, apareceria como se tivesse voltado ao valor do plano.
ok('o take que herdou a mudança também a mostra', diferencasDoPlano(take4, plano).length === 2);
ok('sem base não há diferença a mostrar', diferencasDoPlano(take3, undefined).length === 0);
ok('campo esvaziado no take não vira diferença', diferencasDoPlano({ ...plano, id: 'd5', iso: '' }, plano).length === 0);

// ---- Assinatura de agrupamento ----

ok(
  'planos iguais na mesma câmera compartilham assinatura',
  assinaturaDoPlano('A', plano) === assinaturaDoPlano('A', { ...plano, id: 'outro' }),
);
ok(
  'câmera diferente separa o grupo',
  assinaturaDoPlano('A', plano) !== assinaturaDoPlano('B', plano),
);
ok(
  'técnica diferente separa o grupo',
  assinaturaDoPlano('A', plano) !== assinaturaDoPlano('A', take3),
);
ok(
  'plano sem take agrupa com outro plano sem take',
  assinaturaDoPlano('A', undefined) === assinaturaDoPlano('A', undefined),
);
ok(
  'tipo de captação diferente separa o grupo',
  assinaturaDoPlano('A', plano, 'Insert') !== assinaturaDoPlano('A', plano, 'Drone'),
);
// "Normal" é o padrão: um plano marcado Normal e outro sem tipo são o mesmo plano.
ok(
  'Normal agrupa com plano sem tipo',
  assinaturaDoPlano('A', plano, 'Normal') === assinaturaDoPlano('A', plano, null),
);

// ---- Tipo de captação no papel ----

ok('tipo fora do padrão é impresso', rotuloDoTipo('Insert') === 'Insert');
ok('Normal não vira marca', rotuloDoTipo('Normal') === null);
ok('tipo vazio não vira marca', rotuloDoTipo('   ') === null);
ok('sem tipo não vira marca', rotuloDoTipo(undefined) === null);
// O boletim sempre aceitou tipo digitado; um seletor fechado viraria perda na importação.
ok('tipo digitado à mão é preservado', rotuloDoTipo('Dolly de aproximação') === 'Dolly de aproximação');

// ---- Julgamento da câmera no papel ----

ok('NG é impresso', rotuloDoJulgamento('NG') === 'NG');
ok('PARTIAL vira "Parcial"', rotuloDoJulgamento('PARTIAL') === 'Parcial');
// `RECORDED` é o padrão de todo take: imprimir "OK" em cada linha gastaria tinta e atenção.
ok('RECORDED não vira marca', rotuloDoJulgamento('RECORDED') === null);
// A aprovação já tem selo próprio; repetir a mesma informação com dois nomes confunde.
ok('CIRCLE não duplica o selo de aprovado', rotuloDoJulgamento('CIRCLE') === null);
ok('sem julgamento não imprime nada', rotuloDoJulgamento(null) === null);
// Os valores que mudam de eixo na Fase 6 (ADR-029) ainda não têm apresentação própria.
ok('WILD ainda não é impresso como julgamento', rotuloDoJulgamento('WILD') === null);

// ---- Mídia / Suporte (Fase 5, fechada com o catálogo da Fase 8) ----
//
// A seção que o boletim local pedia digitada à mão. Aqui ela é derivada: o cartão vem do
// take, onde é anotado no instante em que a câmera roda, e o suporte vem do catálogo da
// produção alocado na diária. Testar aqui é testar tela e folha ao mesmo tempo.

const dado = (id, card, roll, volume) => ({ id, card, roll, volume });

const midia = resumoDeMidia(
  [
    dado('d1', 'A002', 'R1', 'CAM_A'),
    dado('d2', 'A002', 'R1', 'CAM_A'),
    dado('d3', 'A010', 'R2', null),
    dado('d4', '  A002  ', ' R2 ', ''),
    dado('d5', '', '', ''),
    dado('d6', null, null, null),
  ],
  [
    { id: 'e1', departamento: 'CAMERA', categoria: 'MEDIA', descricao: 'SanDisk 128GB' },
    { id: 'e2', departamento: 'DIT', categoria: 'MEDIA', descricao: 'SSD Samsung T7' },
    { id: 'e3', departamento: 'SOUND', categoria: 'MEDIA', descricao: 'SD do gravador' },
    { id: 'e4', departamento: 'CAMERA', categoria: 'LENS', descricao: 'Cooke S4 32mm' },
  ],
);

ok('cartões distintos viram uma linha cada', midia.cartoes.length === 2);
ok(
  'a ordem dos cartões é natural, não alfabética',
  midia.cartoes.map((c) => c.cartao).join(',') === 'A002,A010',
);
ok('o cartão conta quantos takes gravou', midia.cartoes[0].takes === 3);
// Espaço em volta do número é digitação, não outro cartão — dois chips iguais na folha
// fariam o DIT procurar um cartão que não existe.
ok('espaço em volta não cria um segundo cartão', midia.cartoes[0].cartao === 'A002');
ok(
  'o cartão lembra em que rolls apareceu',
  midia.cartoes[0].rolls.join(',') === 'R1,R2',
);
ok('roll repetido não duplica dentro do cartão', midia.cartoes[0].rolls.length === 2);
ok('os rolls do dia saem sem repetição e em ordem', midia.rolls.join(',') === 'R1,R2');
ok('volume vazio não vira volume', midia.volumes.join(',') === 'CAM_A');
// A lacuna que a tabela manual nunca respondia: o take existe e ninguém disse onde gravou.
ok('take sem cartão é contado como lacuna', midia.takesSemCartao === 2);
ok(
  'take sem cartão não entra em nenhum cartão',
  midia.cartoes.reduce((soma, c) => soma + c.takes, 0) === 4,
);

// O suporte é do catálogo: cartão e SSD saem no boletim de câmera mesmo cadastrados no
// DIT, mas o cartão do gravador de som responde pelo sound report, não por este.
ok('o suporte de mídia vem do catálogo', midia.suportes.length === 2);
ok(
  'mídia do DIT entra no boletim de câmera',
  midia.suportes.some((item) => item.descricao === 'SSD Samsung T7'),
);
ok(
  'mídia do Som fica fora do boletim de câmera',
  !midia.suportes.some((item) => item.departamento === 'SOUND'),
);
ok(
  'lente não é suporte de mídia',
  !midia.suportes.some((item) => item.categoria === 'LENS'),
);

// Uma produção que nunca cadastrou equipamento imprime como imprimia antes.
const semCatalogo = resumoDeMidia([dado('d1', 'A001', '', '')]);
ok('sem catálogo a seção continua existindo', semCatalogo.cartoes.length === 1);
ok('sem catálogo não há suporte', semCatalogo.suportes.length === 0);

const vazio = resumoDeMidia([], []);
ok('diária vazia não inventa cartão', vazio.cartoes.length === 0);
ok('diária vazia não inventa lacuna', vazio.takesSemCartao === 0);

// ---- A fatia de cada departamento ----

const alocacao = [
  { id: 'e1', departamento: 'CAMERA', categoria: 'MEDIA', descricao: 'SanDisk' },
  { id: 'e2', departamento: 'SOUND', categoria: 'MICROPHONE', descricao: 'MKH 50' },
];

ok(
  'cada departamento lê só a sua fatia',
  equipamentosDoDepartamento(alocacao, 'SOUND').length === 1,
);
ok(
  'departamento sem equipamento devolve lista vazia',
  equipamentosDoDepartamento(alocacao, 'ART').length === 0,
);
ok('lista ausente não quebra o filtro', equipamentosDoDepartamento(undefined, 'CAMERA').length === 0);
ok('lista ausente não quebra o suporte', suportesDeMidia(undefined).length === 0);

// ---- A diária linha a linha, e o CSV da pós (Fase 9) ----
//
// A folha imprime a diária diferencial — o que se repete vira padrão do plano. O arquivo
// não pode: na planilha, célula vazia lê-se como "ninguém anotou", não como "igual ao de
// cima". Estes checks guardam essa diferença.

const reg = { productionId: 'p', version: 0, _dirty: 0 };
const cenaCsv = (id, number, block) => ({ ...reg, id, number, block });
const planoCsv = (id, sceneId, code, sortOrder = 0, kind = null) => ({
  ...reg,
  id,
  sceneId,
  shootingDayId: 'd',
  code,
  sortOrder,
  kind,
});
const takeCsv = (id, setupId, number, extra = {}) => ({
  ...reg,
  id,
  setupId,
  number,
  status: 'RECORDED',
  ...extra,
});

const fonteCsv = {
  cenas: [cenaCsv('c24a', '24', 'A'), cenaCsv('c3', '3', 'A')],
  setups: [
    planoCsv('s1', 'c24a', '1', 0, 'Insert'),
    planoCsv('s2', 'c24a', '2', 1, 'Normal'),
    planoCsv('s3', 'c3', '1', 0),
  ],
  takes: [
    takeCsv('t1', 's1', 1),
    takeCsv('t2', 's1', 2, { kind: 'MOS', durationSec: 42, notes: 'nota do take' }),
    takeCsv('t3', 's2', 1),
    // Take sem dado de câmera: existe (o Som pode tê-lo criado), mas não vira linha.
    takeCsv('t4', 's3', 1),
  ],
  cameras: [
    { ...reg, id: 'camB', label: 'B' },
    { ...reg, id: 'camA', label: 'A' },
  ],
  dadosCamera: [
    {
      ...reg,
      id: 'd1',
      takeId: 't1',
      cameraUnitId: 'camA',
      approved: true,
      status: 'CIRCLE',
      card: 'A002',
      roll: 'R1',
      fileName: 'A002C001_001',
      lens: 'Cooke 32mm',
      iso: '800',
      matteBox: true,
      notes: 'estourou o fundo; refazer',
    },
    // Multicam: o mesmo take gravado por duas câmeras são dois clips, duas linhas.
    {
      ...reg,
      id: 'd2',
      takeId: 't1',
      cameraUnitId: 'camB',
      approved: false,
      status: 'NG',
      ngReason: 'foco',
      card: 'B004',
      fileName: 'B004C001_001',
      iso: '800',
    },
    {
      ...reg,
      id: 'd3',
      takeId: 't2',
      cameraUnitId: 'camA',
      approved: false,
      card: 'A002',
      iso: '1600',
      fileName: 'A002C002_001',
    },
    {
      ...reg,
      id: 'd4',
      takeId: 't3',
      cameraUnitId: 'camA',
      approved: false,
      iso: '800',
      fileName: 'A002C003_001',
    },
  ],
};

const linhasCsv = linhasDoBoletim(fonteCsv);

ok('cada câmera do take vira uma linha', linhasCsv.length === 4);
// Um take sem clip nenhum não tem o que a pós conformar; linha vazia é ruído.
ok(
  'take sem dado de câmera não vira linha',
  !linhasCsv.some((linha) => linha.takeId === 't4'),
);
// A cena 3 vem antes da 24 (ordem numérica, não alfabética), e dentro dela o take sem
// dado de câmera não aparece — por isso a cena 3 não abre a lista.
ok(
  'a ordem é a do dia: cena, bloco, plano, take',
  linhasCsv.map((linha) => `${linha.cena}.${linha.plano}.${linha.take}`).join(',') ===
    '24.1.1,24.1.1,24.1.2,24.2.1',
);
ok(
  'as câmeras do mesmo take saem em ordem de rótulo',
  linhasCsv[0].camera === 'A' && linhasCsv[1].camera === 'B',
);
ok('o valor técnico sai por extenso em cada linha', linhasCsv[2].tecnica.iso === '1600');
ok('o tipo Normal não vira valor', linhasCsv[3].tipo === '');
ok('o tipo diferente de Normal sai', linhasCsv[0].tipo === 'Insert');
ok('a natureza do take compartilhado sai', linhasCsv[2].natureza === 'MOS');
ok('o julgamento da câmera sai cru para a planilha', linhasCsv[1].julgamento === 'NG');
ok('o motivo do NG acompanha o julgamento', linhasCsv[1].motivoNG === 'foco');
ok('a aprovação do diretor sai como booleano', linhasCsv[0].aprovado === true);
ok('matte box vira booleano, não marca de texto', linhasCsv[0].matteBox === true);
ok('a nota do take se junta à da câmera', linhasCsv[2].nota.includes('nota do take'));
ok('a duração do take acompanha a linha', linhasCsv[2].duracaoSeg === 42);

const csv = montaCSV(linhasCsv, { projeto: 'Projeto X', data: '2026-08-19' });
const CRLF = '\r\n';
const linhasArquivo = csv.split(CRLF);

ok('o arquivo tem cabeçalho e uma linha por clip', linhasArquivo.length === 5);
ok('as linhas terminam em CRLF (RFC 4180)', csv.includes(CRLF));
// Uma coluna técnica esquecida no arquivo é um dado que a pós nunca vai ver.
ok(
  'toda coluna técnica do módulo entra no arquivo',
  CAMPOS_TECNICOS.every(({ coluna }) => linhasArquivo[0].split(',').includes(coluna)),
);
ok(
  'o cabeçalho começa por projeto e data',
  linhasArquivo[0].startsWith('projeto,data,cena,bloco,plano,tipo,take,camera'),
);
// O ponto e vírgula é separador no Excel em pt-BR: sem aspas, a nota quebraria a linha.
ok(
  'nota com ponto e vírgula sai entre aspas',
  linhasArquivo[1].includes('"estourou o fundo; refazer"'),
);
// Célula vazia numa planilha lê-se como "ninguém preencheu" — o take normal tem nome.
ok('take sem natureza vira Sync no arquivo', linhasArquivo[1].split(',').includes('Sync'));
ok('take MOS mantém a natureza no arquivo', linhasArquivo[3].split(',').includes('MOS'));
ok('o cabeçalho é o mesmo que `colunasDoCSV` declara', linhasArquivo[0] === colunasDoCSV().join(','));
ok(
  'diária vazia ainda gera o cabeçalho',
  montaCSV([], { projeto: 'X', data: '2026-08-19' }) === colunasDoCSV().join(','),
);

ok(
  'o nome do arquivo perde acento e espaço',
  nomeDoArquivo({ projeto: 'Ação Entre Amigos', data: '2026-08-19' }) ===
    'camera-acao-entre-amigos-2026-08-19.csv',
);
ok(
  'projeto sem nome não gera arquivo sem nome',
  nomeDoArquivo({ projeto: '   ', data: '2026-08-19' }) === 'camera-diaria-2026-08-19.csv',
);

let failed = 0;
for (const c of checks) {
  if (!c.pass) failed++;
  console.log(`${c.pass ? '✓' : '✗'} ${c.name}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passaram.`);
process.exit(failed === 0 ? 0 : 1);
