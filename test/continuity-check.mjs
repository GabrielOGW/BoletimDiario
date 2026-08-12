// A estrutura do Boletim de Continuidade: vereditos, duração, campos preenchidos e as
// contagens do Relatório de Progresso da Diária (continuity.md §3, §7; ADR-034).
//
// O relatório é um documento DERIVADO. Se ele contar de um jeito e a tela mostrar de
// outro, a discussão do fim do dia não tem quem arbitre — e é a produção que lê o número.
import {
  CAMPOS_DE_ACAO,
  camposPreenchidos,
  contagensDoDia,
  duracaoEmSegundos,
  linhasDaContinuidade,
  rotuloDoVeredito,
  segundosEmDuracao,
} from '@/features/continuity/estrutura.ts';

const checks = [];
const ok = (name, cond) => checks.push({ name, pass: !!cond });

const base = { productionId: 'p', version: 0, _dirty: 0 };

const cena = (id, number, block, page) => ({ ...base, id, number, block, page });
const plano = (id, sceneId, code, sortOrder = 0) => ({
  ...base,
  id,
  sceneId,
  shootingDayId: 'd',
  code,
  sortOrder,
});
const take = (id, setupId, number) => ({
  ...base,
  id,
  setupId,
  number,
  status: 'RECORDED',
  kind: 'SYNC',
});
const cont = (takeId, extra = {}) => ({
  ...base,
  id: `c-${takeId}`,
  takeId,
  selected: false,
  ...extra,
});

// ---- Os três vereditos (§7) ----

ok('CIRCLE é o print da continuidade', rotuloDoVeredito('CIRCLE') === 'Print');
// "Bom, mas não perfeito" não tinha onde morar antes de ADR-029.
ok('HOLD existe e tem rótulo', rotuloDoVeredito('HOLD') === 'Hold');
ok('NG tem rótulo', rotuloDoVeredito('NG') === 'NG');
ok('RECORDED não é veredito', rotuloDoVeredito('RECORDED') === null);
ok('sem status não há veredito', rotuloDoVeredito(null) === null);

// ---- Duração cronometrada ----
// Cronômetro continua sendo o dedo da continuísta: o que existe é aceitar o que ela leu.

ok('mm:ss vira segundos', duracaoEmSegundos('00:42') === 42);
ok('h:mm:ss vira segundos', duracaoEmSegundos('1:05:03') === 3903);
ok('só segundos também vale', duracaoEmSegundos('42') === 42);
ok('vazio não é duração zero', duracaoEmSegundos('') === null);
ok('texto não vira duração', duracaoEmSegundos('quase um minuto') === null);
ok('segundos voltam formatados', segundosEmDuracao(42) === '00:42');
ok('mais de uma hora ganha o campo de hora', segundosEmDuracao(3903) === '1:05:03');
ok('sem duração não imprime nada', segundosEmDuracao(null) === '');
ok('ida e volta preserva', segundosEmDuracao(duracaoEmSegundos('12:07')) === '12:07');

// ---- Campos de ação: só os preenchidos (§3) ----

const catorze = CAMPOS_DE_ACAO.flatMap((grupo) => grupo.campos);
ok('os campos de ação estão agrupados como o caderno agrupa', CAMPOS_DE_ACAO.length === 4);
ok('todo campo de ação tem rótulo e exemplo', catorze.every((c) => c.rotulo && c.exemplo));
ok('não há campo repetido entre grupos', new Set(catorze.map((c) => c.campo)).size === catorze.length);

const comDois = cont('t1', { action: 'João entra pela esquerda', eyeline: 'Fora do quadro' });
ok('só os campos com valor aparecem', camposPreenchidos(comDois).length === 2);
ok('o campo vazio não aparece', camposPreenchidos(cont('t1', { action: '   ' })).length === 0);
ok('take sem dados não tem campo preenchido', camposPreenchidos(undefined).length === 0);
ok(
  'o rótulo acompanha o valor',
  camposPreenchidos(comDois)[0].rotulo === 'Ação' &&
    camposPreenchidos(comDois)[0].valor === 'João entra pela esquerda',
);

// ---- A diária lida de ponta a ponta ----

const fonte = {
  cenas: [
    cena('c24a', '24', 'A', '2 4/8'),
    // Mesmo número, outro bloco: **a mesma página de roteiro** (ADR-002).
    cena('c24b', '24', 'B', '2 4/8'),
    cena('c31', '31', 'A', '1/8'),
    // Cena do roteiro que não foi rodada hoje.
    cena('c40', '40', 'A', '3'),
  ],
  setups: [
    plano('p1', 'c24a', '1', 0),
    plano('p2', 'c24b', '1', 0),
    plano('p3', 'c31', '1', 0),
  ],
  takes: [
    take('t2', 'p1', 2),
    take('t1', 'p1', 1),
    take('t3', 'p2', 1),
    take('t4', 'p3', 1),
  ],
  dados: [
    cont('t1', { status: 'NG', ngReason: 'Ator errou a marca', durationSec: 30 }),
    cont('t2', { status: 'CIRCLE', selected: true, durationSec: 42, notes: 'Melhor take' }),
    cont('t3', { status: 'HOLD', durationSec: 51 }),
  ],
  camera: [
    { ...base, id: 'cam1', takeId: 't2', lens: '35mm', tStop: 'T2.8', card: 'A012' },
    { ...base, id: 'cam2', takeId: 't4', card: 'A013' },
  ],
  som: [{ ...base, id: 'som1', takeId: 't2', soundRoll: '004', fileName: '004_002' }],
};

const linhas = linhasDaContinuidade(fonte);

ok('todo take entra na leitura', linhas.length === 4);
ok(
  'a ordem é cena, bloco, plano, take',
  linhas.map((l) => `${l.cena}${l.bloco}/${l.take}`).join(',') === '24A/1,24A/2,24B/1,31A/1',
);

const print = linhas.find((l) => l.take === 2 && l.bloco === 'A');
ok('o print é marcado', print.print === true && print.veredito === 'Print');
ok('a duração sai formatada', print.duracao === '00:42');
// §34: a continuísta lê o que a câmera registrou em vez de copiar — copiar é onde erra.
ok('a técnica vem da câmera, do mesmo take', print.tecnica === '35mm T2.8');
ok('o roll vem do som, do mesmo take', print.som === '004 · 004_002');
ok('take sem dados dos outros não inventa nada', linhas[0].som === '');

const ng = linhas.find((l) => l.veredito === 'NG');
ok('o motivo do NG chega na linha', ng.motivoNG === 'Ator errou a marca');
ok('o take sem anotação é sinalizado', linhas.find((l) => l.take === 1 && l.cena === '31').semDados === true);

// ---- As contagens do relatório (§7, ADR-034) ----

const contagens = contagensDoDia(fonte);

ok('conta as cenas rodadas pelo número, não pelo bloco', contagens.cenas === 2);
ok('conta os planos rodados', contagens.planos === 3);
ok('conta os takes', contagens.takes === 4);
ok('conta os prints', contagens.prints === 1);
ok('soma a duração cronometrada', contagens.duracao === '02:03');

// A armadilha: 24A e 24B são duas `Scene` com a MESMA página de roteiro. Somar as duas
// mostraria o dia com o dobro da cobertura, justo no número que a produção usa para saber
// se está atrasada.
ok('a página da cena não é contada duas vezes por causa dos blocos', contagens.paginas.formatado === '2 5/8');
// Cena que não foi rodada hoje não entra: a pergunta é quanto o DIA cobriu.
ok('cena não rodada não entra na conta de páginas', contagens.paginas.oitavos === 21);

ok('os cartões vêm da câmera', contagens.cartoes.join(',') === 'A012,A013');
ok('os rolls vêm do som', contagens.rolls.join(',') === '004');
ok('a sugestão de cobertura lista as cenas rodadas', contagens.cenasRodadas.join(',') === '24A,24B,31A');

// Página que ninguém consegue somar não vira zero silencioso.
const comPaginaEstranha = contagensDoDia({
  ...fonte,
  cenas: [cena('c24a', '24', 'A', 'meia página'), cena('c31', '31', 'A', '1/8')],
});
ok('página ilegível é devolvida, não somada como zero', comPaginaEstranha.paginas.naoSomados.length === 1);
ok('o que dá para somar continua somando', comPaginaEstranha.paginas.formatado === '1/8');

// ---- Diária vazia ----

const vazia = { cenas: [], setups: [], takes: [], dados: [], camera: [], som: [] };
ok('diária vazia não gera linha', linhasDaContinuidade(vazia).length === 0);
ok('contagens de diária vazia são zero', contagensDoDia(vazia).takes === 0);
ok('diária vazia não tem página somada', contagensDoDia(vazia).paginas.formatado === '0');

let failed = 0;
for (const c of checks) {
  if (!c.pass) failed++;
  console.log(`${c.pass ? '✓' : '✗'} ${c.name}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passaram.`);
process.exit(failed === 0 ? 0 : 1);
