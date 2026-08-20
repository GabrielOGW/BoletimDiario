// O caminho curto até a anotação (Fase 11 — ADR-037).
//
// São quatro regras pequenas que decidem para onde o app leva alguém no primeiro toque do
// dia. Errar qualquer uma abre a diária errada — e abrir a diária errada em set é pior do
// que não ter atalho: a pessoa anota o take de hoje no dia de ontem.
import {
  ATALHO_VALIDO_POR_DIAS,
  caminhoDoAtalho,
  diasDesde,
  diasParaFixar,
  esqueceDiaria,
  hojeLocal,
  lembraDiaria,
  rotaDoDepartamento,
  ultimaDiaria,
} from '@/lib/atalhos.ts';

const checks = [];
const ok = (name, cond) => checks.push({ name, pass: !!cond });

// ---- A rota de cada departamento ----

ok('Câmera anota em /camera', rotaDoDepartamento('CAMERA') === 'camera');
ok('Som anota em /som', rotaDoDepartamento('SOUND') === 'som');
ok('Continuidade anota em /continuidade', rotaDoDepartamento('CONTINUITY') === 'continuidade');
// Direção, produção e DIT não anotam take: mandá-los para /camera seria abrir uma tela de
// escrita para quem não escreve nela.
ok('departamento sem módulo cai na diária', rotaDoDepartamento('DIRECTION') === '');
ok('departamento desconhecido cai na diária', rotaDoDepartamento('QUALQUER') === '');

// ---- O endereço ----

const base = { productionId: 'p1', shootingDayId: 'd1' };

ok(
  'o atalho vira o endereço do módulo',
  caminhoDoAtalho({ ...base, modulo: 'camera' }) === '/p/p1/diarias/d1/camera',
);
ok(
  'sem módulo, o endereço é o da diária',
  caminhoDoAtalho({ ...base, modulo: '' }) === '/p/p1/diarias/d1',
);

// ---- Hoje é do aparelho, não do servidor (R9) ----

// 19/08/2026 às 21h em Brasília já é 20/08 em UTC. Se "hoje" viesse do servidor, o atalho
// abriria a diária de amanhã — que ainda não aconteceu.
const noiteDeBrasilia = new Date(2026, 7, 19, 21, 30);
ok('hoje sai do relógio local, não de UTC', hojeLocal(noiteDeBrasilia) === '2026-08-19');
ok('mês e dia saem com dois dígitos', hojeLocal(new Date(2026, 0, 5)) === '2026-01-05');

// ---- O que fica no aparelho: hoje e amanhã ----

const agora = new Date(2026, 7, 19, 10, 0);
const dias = [
  { id: 'ontem', date: '2026-08-18' },
  { id: 'hoje', date: '2026-08-19' },
  { id: 'amanha', date: '2026-08-20' },
  { id: 'semana', date: '2026-08-26' },
];
const fixar = diasParaFixar(dias, agora);

ok('hoje é fixada', fixar.includes('hoje'));
// A diária de amanhã costuma começar antes de haver sinal: quem sai às 5h para uma
// locação sem cobertura precisa dela já no aparelho.
ok('amanhã é fixada', fixar.includes('amanha'));
ok('ontem não é fixada', !fixar.includes('ontem'));
ok('a semana que vem não é fixada', !fixar.includes('semana'));
ok('só hoje e amanhã entram', fixar.length === 2);

// Virada de mês e de ano: "amanhã" não é `date + 1` no número do dia.
ok(
  'amanhã atravessa a virada de mês',
  diasParaFixar([{ id: 'x', date: '2026-09-01' }], new Date(2026, 7, 31, 8, 0)).length === 1,
);
ok(
  'amanhã atravessa a virada de ano',
  diasParaFixar([{ id: 'x', date: '2027-01-01' }], new Date(2026, 11, 31, 8, 0)).length === 1,
);
ok('produção sem diária hoje não fixa nada', diasParaFixar([], agora).length === 0);

// ---- O atalho envelhece ----

ok('hoje são zero dias', diasDesde(new Date().toISOString()) === 0);
ok(
  'uma semana atrás são sete dias',
  diasDesde(new Date(Date.now() - 7 * 86_400_000).toISOString()) === 7,
);
// Data corrompida não pode virar um atalho eterno.
ok('data ilegível vale como infinitamente antiga', diasDesde('não é data') === Infinity);

// ---- localStorage: o ponteiro sobrevive, mas não para sempre ----
//
// O módulo lê `window`; aqui ele é forjado, porque a regra que interessa é a de validade,
// não a do navegador. Um `localStorage` de verdade entra no Playwright da Fase 10.

const memoria = new Map();
globalThis.window = {
  localStorage: {
    getItem: (chave) => (memoria.has(chave) ? memoria.get(chave) : null),
    setItem: (chave, valor) => memoria.set(chave, valor),
    removeItem: (chave) => memoria.delete(chave),
  },
};

ok('sem nada gravado não há atalho', ultimaDiaria() === null);

lembraDiaria({
  productionId: 'p1',
  shootingDayId: 'd1',
  modulo: 'som',
  producao: 'Filme X',
  diaria: 'Diária 12 · 19/08/2026',
});

const guardado = ultimaDiaria();
ok('o atalho gravado volta inteiro', guardado?.modulo === 'som' && guardado?.productionId === 'p1');
// Os rótulos vão junto porque quem lê o atalho pode estar sem rede.
ok('o rótulo da produção vem junto', guardado?.producao === 'Filme X');
ok('o rótulo da diária vem junto', guardado?.diaria === 'Diária 12 · 19/08/2026');

// Depois de uma semana o atalho vira palpite: a diária acabou, a produção virou outra.
const depois = Date.now() + (ATALHO_VALIDO_POR_DIAS + 1) * 86_400_000;
ok('atalho velho não é oferecido', ultimaDiaria(depois) === null);
ok('atalho de ontem continua valendo', ultimaDiaria(Date.now() + 86_400_000) !== null);

memoria.set('bdc:ultima-diaria:v1', '{isso não é json');
ok('conteúdo corrompido não quebra a tela inicial', ultimaDiaria() === null);

memoria.set('bdc:ultima-diaria:v1', JSON.stringify({ productionId: 'p1' }));
ok('atalho incompleto é descartado', ultimaDiaria() === null);

esqueceDiaria();
ok('esquecer apaga o atalho', ultimaDiaria() === null);

let failed = 0;
for (const c of checks) {
  if (!c.pass) failed++;
  console.log(`${c.pass ? '✓' : '✗'} ${c.name}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passaram.`);
process.exit(failed === 0 ? 0 : 1);
