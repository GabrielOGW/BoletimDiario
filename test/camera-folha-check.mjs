// A estrutura do Boletim de Câmera: agrupamento Cena → Bloco, linha técnica do plano,
// diferenças por take e assinatura de agrupamento (ADR-011, ADR-030).
//
// É o que a tela e a folha impressa leem em comum. Testar aqui é testar as duas: se o
// agrupamento divergir, o PDF mostra uma diária diferente da que foi preenchida.
import {
  agrupaCenas,
  assinaturaDoPlano,
  diferencasDoPlano,
  partesTecnicas,
  resumoDeMidia,
  rotuloDoJulgamento,
  rotuloDoTipo,
} from '@/features/camera/estrutura.ts';
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

let failed = 0;
for (const c of checks) {
  if (!c.pass) failed++;
  console.log(`${c.pass ? '✓' : '✗'} ${c.name}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passaram.`);
process.exit(failed === 0 ? 0 : 1);
