// A estrutura do Boletim de Som: a leitura da diária que a tela, a folha impressa e o CSV
// compartilham (ADR-029, sound.md §5 e §6).
//
// É o teste que sustenta o entregável do módulo. Se a ordem das linhas divergir, o sound
// report mostra uma diária diferente da que foi preenchida; se o CSV escapar mal, o
// arquivo abre torto no computador da pós — e é lá que ele é usado, não aqui.
import {
  linhasDoRelatorio,
  resumoDeTracks,
  resumoDoDia,
  rotuloDaNatureza,
  rotuloDoJulgamento,
} from '@/features/sound/estrutura.ts';
import { colunasDeTrack, montaCSV, nomeDoArquivo } from '@/features/sound/csv.ts';

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
const som = (takeId, extra = {}) => ({
  ...base,
  id: `s-${takeId}`,
  takeId,
  circled: false,
  ...extra,
});
const track = (takeId, index, name, source) => ({
  ...base,
  id: `t-${takeId}-${index}`,
  takeId,
  index,
  name,
  source,
});

// ---- Natureza do take (ADR-029) ----

ok('SYNC não é impresso: é o que quase todo take é', rotuloDaNatureza('SYNC') === null);
ok('sem natureza não vira marca', rotuloDaNatureza(null) === null);
ok('natureza em branco não vira marca', rotuloDaNatureza('   ') === null);
// A lacuna mais séria do levantamento: dizer que o take existe e o som não.
ok('MOS é impresso', rotuloDaNatureza('MOS') === 'MOS');
ok('ROOM_TONE vira "Room tone"', rotuloDaNatureza('ROOM_TONE') === 'Room tone');
ok('PICKUP vira "Pick-up"', rotuloDaNatureza('PICKUP') === 'Pick-up');
// Valor que o banco aceite e a interface ainda não conheça não pode sumir da folha.
ok('natureza desconhecida sai como veio', rotuloDaNatureza('FUTURO') === 'FUTURO');

// ---- Julgamento do som (ADR-010) ----

ok('RECORDED é o padrão e não vira marca', rotuloDoJulgamento('RECORDED') === null);
// O circled já tem coluna própria; o mesmo fato com dois nomes na mesma linha confunde.
ok('CIRCLE não duplica a coluna de circled', rotuloDoJulgamento('CIRCLE') === null);
ok('NG é impresso', rotuloDoJulgamento('NG') === 'NG');
ok('HOLD vira "Hold"', rotuloDoJulgamento('HOLD') === 'Hold');
ok('PARTIAL vira "Parcial"', rotuloDoJulgamento('PARTIAL') === 'Parcial');
ok('sem julgamento não imprime nada', rotuloDoJulgamento(undefined) === null);

// ---- A diária lida de ponta a ponta ----

const fonte = {
  cenas: [cena('c24a', '24', 'A'), cena('c24b', '24', 'B'), cena('c3', '3', 'A')],
  setups: [
    plano('p1', 'c24a', '1', 0),
    plano('p2', 'c24a', '2', 1),
    plano('pw', 'c24a', 'WILD', 900),
    plano('p3', 'c24b', '1', 0),
    plano('p0', 'c3', '1', 0),
  ],
  takes: [
    take('t-p1-2', 'p1', 2),
    take('t-p1-1', 'p1', 1),
    take('t-p2-1', 'p2', 1, 'MOS'),
    take('t-pw-1', 'pw', 1, 'ROOM_TONE'),
    take('t-p3-1', 'p3', 1),
    take('t-p0-1', 'p0', 1),
  ],
  dados: [
    som('t-p1-1', { soundRoll: '004', fileName: '004_001', status: 'NG', ngReason: 'Avião' }),
    som('t-p1-2', {
      soundRoll: '004',
      fileName: '004_002',
      status: 'CIRCLE',
      circled: true,
      tcStart: '14:32:10:12',
    }),
    som('t-pw-1', { soundRoll: '004', fileName: '004_003', notes: 'Room tone da locação' }),
    som('t-p3-1', { soundRoll: '005', fileName: '005_001' }),
  ],
  tracks: [
    track('t-p1-1', 2, 'João', 'DPA 4060'),
    track('t-p1-1', 1, 'Boom', 'MKH 416'),
    track('t-p1-2', 1, 'Boom', 'MKH 416'),
  ],
};

const linhas = linhasDoRelatorio(fonte);

ok('toda linha da diária entra no relatório', linhas.length === 6);
ok(
  'a ordem é cena numérica, não alfabética',
  linhas.map((l) => l.cena).join(',') === '3,24,24,24,24,24',
);
ok(
  'dentro da cena, os blocos saem em ordem de letra',
  linhas.filter((l) => l.cena === '24').map((l) => l.bloco).join('') === 'AAAAB',
);
ok(
  'dentro do bloco, os planos saem na ordem do dia',
  linhas
    .filter((l) => l.cena === '24' && l.bloco === 'A')
    .map((l) => l.plano)
    .join(',') === '1,1,2,WILD',
);
ok(
  'dentro do plano, os takes saem por número',
  linhas
    .filter((l) => l.plano === '1' && l.bloco === 'A' && l.cena === '24')
    .map((l) => l.take)
    .join(',') === '1,2',
);

const linhaMOS = linhas.find((l) => l.plano === '2');
// Sem esta linha, a ausência de áudio ficaria ambígua entre "foi MOS" e "ninguém anotou".
ok('o take MOS aparece mesmo sem dados de som', !!linhaMOS);
ok('o take MOS é marcado como tal', linhaMOS.mos === true);
ok('o take MOS imprime a natureza', linhaMOS.natureza === 'MOS');
ok('o take MOS não tem arquivo', linhaMOS.arquivo === '');
ok('o take sem dados de som é sinalizado', linhaMOS.semDados === true);

const linhaNG = linhas.find((l) => l.take === 1 && l.plano === '1' && l.cena === '24');
ok('o julgamento do som chega na linha', linhaNG.julgamento === 'NG');
// "NG" sem motivo é anotação inútil na pós (ADR-029).
ok('o motivo do NG chega na linha', linhaNG.motivoNG === 'Avião');
ok('as tracks do take vêm ordenadas por índice', linhaNG.tracks.map((t) => t.index).join(',') === '1,2');
ok('a track guarda nome e fonte', linhaNG.tracks[0].nome === 'Boom' && linhaNG.tracks[0].fonte === 'MKH 416');

const linhaCircled = linhas.find((l) => l.take === 2);
ok('o circled do som chega na linha', linhaCircled.circled === true);
ok('CIRCLE não vira também julgamento impresso', linhaCircled.julgamento === null);
ok('o timecode chega na linha', linhaCircled.tcInicio === '14:32:10:12');

ok('take sem dados nem tracks não quebra a leitura', linhas.every((l) => Array.isArray(l.tracks)));
ok('take de cena sem som entra vazio', linhas.find((l) => l.cena === '3').arquivo === '');

// ---- Resumo do dia ----

const resumo = resumoDoDia(linhas);

ok('o resumo conta todos os takes', resumo.takes === 6);
// MOS é take registrado, não take esquecido — e take sem linha de som não é "com som".
ok('"com som" exclui MOS e take não preenchido', resumo.comSom === 4);
ok('o resumo conta os circled', resumo.circled === 1);
ok('o resumo conta os MOS', resumo.mos === 1);
ok('o resumo conta os NG', resumo.ng === 1);
ok('os rolls saem distintos e ordenados', resumo.rolls.join(',') === '004,005');
ok('os arquivos são contados sem repetir', resumo.arquivos === 4);

ok('o resumo de tracks é o da tela', resumoDeTracks(linhaNG.tracks) === '1 Boom · 2 João');
ok('track sem nome cai para a fonte', resumoDeTracks([{ index: 1, nome: '', fonte: 'Plant' }]) === '1 Plant');
ok('sem tracks o resumo é vazio', resumoDeTracks([]) === '');

// ---- CSV ----

const csv = montaCSV(linhas, { projeto: 'Nome do Filme', data: '2026-08-11' });
const linhasCSV = csv.split('\r\n');
const cabecalho = linhasCSV[0].split(',');

// A pós monta o template dela uma vez: o cabeçalho não pode dançar entre diárias.
ok('o CSV termina as linhas em CRLF (RFC 4180)', csv.includes('\r\n') && !csv.includes('\n\r'));
ok('o CSV tem uma linha por take, mais o cabeçalho', linhasCSV.length === 7);
ok('o cabeçalho começa por projeto e data', cabecalho[0] === 'projeto' && cabecalho[1] === 'data');
ok('o cabeçalho traz cena, bloco, plano e take', ['cena', 'bloco', 'plano', 'take'].every((c) => cabecalho.includes(c)));
ok('o cabeçalho traz as colunas que a pós espera', ['roll', 'arquivo', 'tc_inicio', 'tc_fim', 'circled', 'natureza'].every((c) => cabecalho.includes(c)));
ok('o mínimo de quatro canais é respeitado', colunasDeTrack(linhas) === 4);
ok('as colunas de track são numeradas', cabecalho.includes('track_1') && cabecalho.includes('track_4'));

const linhaCSVdoMOS = linhasCSV.find((l) => l.includes('MOS'));
ok('o MOS chega ao CSV', !!linhaCSVdoMOS);
// Célula em branco lê-se como "ninguém preencheu", que é outra coisa.
ok('o take normal sai como "Sync", não em branco', linhasCSV[1].includes('Sync'));
ok('o circled sai legível', linhasCSV.some((l) => l.includes('sim')) && linhasCSV.some((l) => l.includes('não')));
ok('a track vai com nome e fonte na mesma célula', csv.includes('Boom · MKH 416'));

// Escape: é o que decide se o arquivo abre inteiro do outro lado.
const perigosas = linhasDoRelatorio({
  cenas: [cena('c1', '1', 'A')],
  setups: [plano('p1', 'c1', '1')],
  takes: [take('t1', 'p1', 1)],
  dados: [som('t1', { notes: 'avião; helicóptero, e "buzina"' })],
  tracks: [],
});
const csvPerigoso = montaCSV(perigosas, { projeto: 'X', data: '2026-08-11' });

ok('vírgula na nota não quebra a linha', csvPerigoso.includes('"avião; helicóptero, e ""buzina"""'));
ok('a aspa é dobrada, não removida', csvPerigoso.includes('""buzina""'));
// O Excel em pt-BR trata `;` como separador ao reabrir o arquivo.
ok('ponto e vírgula também é protegido', csvPerigoso.split('\r\n')[1].split(',').length < 30);

const comMuitasTracks = linhasDoRelatorio({
  cenas: [cena('c1', '1', 'A')],
  setups: [plano('p1', 'c1', '1')],
  takes: [take('t1', 'p1', 1)],
  dados: [som('t1')],
  tracks: [track('t1', 6, 'Plant', ''), track('t1', 1, 'Boom', '')],
});
// O limite de quatro canais é do caderno de papel, não do domínio (§11).
ok('mais de quatro canais expandem o cabeçalho', colunasDeTrack(comMuitasTracks) === 6);
ok(
  'canal ausente no meio vira célula vazia, não deslocamento',
  montaCSV(comMuitasTracks, { projeto: 'X', data: '2026-08-11' })
    .split('\r\n')[1]
    .endsWith(',,,,Plant'),
);

ok('o nome do arquivo é legível e sem acento', nomeDoArquivo({ projeto: 'Ação Sem Título', data: '2026-08-11' }) === 'som-acao-sem-titulo-2026-08-11.csv');
ok('projeto sem nome ainda gera arquivo', nomeDoArquivo({ projeto: '   ', data: '2026-08-11' }) === 'som-diaria-2026-08-11.csv');

// ---- Diária vazia ----

const vazia = linhasDoRelatorio({ cenas: [], setups: [], takes: [], dados: [], tracks: [] });
ok('diária vazia não gera linha', vazia.length === 0);
ok('resumo de diária vazia é zero', resumoDoDia(vazia).takes === 0);
ok('CSV de diária vazia ainda tem cabeçalho', montaCSV(vazia, { projeto: 'X', data: '2026-08-11' }).split('\r\n').length === 1);

let failed = 0;
for (const c of checks) {
  if (!c.pass) failed++;
  console.log(`${c.pass ? '✓' : '✗'} ${c.name}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passaram.`);
process.exit(failed === 0 ? 0 : 1);
