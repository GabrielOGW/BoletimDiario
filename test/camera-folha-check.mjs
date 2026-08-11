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
} from '@/features/camera/estrutura.ts';

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

let failed = 0;
for (const c of checks) {
  if (!c.pass) failed++;
  console.log(`${c.pass ? '✓' : '✗'} ${c.name}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passaram.`);
process.exit(failed === 0 ? 0 : 1);
