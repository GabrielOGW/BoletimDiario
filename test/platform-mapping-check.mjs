// Migração dos dados existentes: Boletim v2 → modelo da plataforma (§40).
// Cobre o caminho completo v1 → normalizeBoletim() → mapeador, que é exatamente o que
// vai rodar no dispositivo de quem já usa o app.
import { normalizeBoletim } from '@/lib/normalize.ts';
import {
  countBoletins,
  countSnapshot,
  groupBoletins,
  mapBoletimToProduction,
  mapBoletinsToProductions,
} from '@/domain/platform/from-boletim.ts';

const NOW = '2026-08-10T12:00:00.000Z';
const OPTS = { now: NOW, actorId: 'user_1' };

const checks = [];
const ok = (name, cond) => checks.push({ name, pass: !!cond });

// ============================================================
// Fixtures
// ============================================================

/** Mesmo boletim v1 real usado em test/migration-check.mjs. */
const v1 = {
  id: 'bol_legacy_1',
  schemaVersion: 1,
  producao: {
    produtora: 'Produtora X',
    tituloProjeto: 'Filme Antigo',
    diretor: 'Dir',
    diretorFotografia: 'DoP',
    data: '2026-05-29',
    diaDiaria: '12',
  },
  camera: {
    numeroId: 'A',
    modelo: 'RED V-Raptor',
    operador: 'Op A',
    foco: '1AC',
    claquetista: 'Claq',
  },
  cenas: [
    {
      id: 'cena_old_1',
      numeroNome: '18 A 1',
      tecnica: {
        formatoGravacao: 'R3D MQ',
        resolucao: '5K 17:9',
        frameRate: '23.98',
        iso: '640',
        obturador: '180',
        balancoBranco: '5300K',
        lutPerfil: '709',
        espacoCor: '',
        diafragma: 'T2.8',
      },
      optica: { lentes: '25mm', filtros: 'ND 0.9', matteBox: true },
      cartaoRolo: 'A004',
      observacoes: 'cena principal',
      takes: [
        { id: 't1', numero: '6', observacao: 'Foco doce', aprovado: true },
        { id: 't2', numero: '1', observacao: 'Boom safe', aprovado: false },
      ],
    },
    {
      id: 'cena_old_2',
      numeroNome: '17.1',
      tecnica: {},
      optica: {},
      cartaoRolo: 'A005',
      takes: [],
    },
  ],
  midiaSuporte: [
    {
      id: 'm1',
      tipoMidia: 'RED MINI-MAG',
      numeroCartao: 'A004',
      quantidade: '1',
      responsavel: 'DIT',
    },
  ],
  cenasDoDia: {
    cenasRealizadas: '18, 17.1',
    totalTakes: '2',
    tomadasAprovadas: '1',
    continuidade: 'segue amanhã',
  },
  horarios: {
    inicio: '07:00',
    fim: '18:00',
    almoco: '14:00–15:00',
    totalHoras: '11h',
    horaExtra: '—',
  },
  equipeCamera: [{ id: 'e1', nome: 'Op A', funcao: 'Operador(a)' }],
  observacoesGerais: 'nota geral',
  createdAt: '2026-05-29T10:00:00.000Z',
  updatedAt: '2026-05-29T20:00:00.000Z',
};

/** Boletim v2 multicam com uma cena de três blocos (24A / 24B / 24C). */
function makeV2(overrides = {}) {
  return normalizeBoletim({
    id: 'bol_v2_1',
    schemaVersion: 2,
    producao: {
      produtora: 'Produtora Y',
      tituloProjeto: 'Filme X',
      diretor: 'Dir X',
      diretorFotografia: 'DoP X',
      data: '2026-08-10',
      diaDiaria: '12',
    },
    camerasCadastradas: [
      { id: 'cam_a', nomeId: 'A', modelo: 'Alexa 35', operador: 'Gabriel' },
      { id: 'cam_b', nomeId: 'B', modelo: 'Alexa Mini', operador: 'Ana' },
    ],
    cenas: [
      {
        id: 'cena_24',
        numero: '24',
        blocos: [
          {
            id: 'bl_a',
            letra: 'A',
            planos: [
              {
                id: 'plano_a1',
                numero: '1',
                tipo: 'Normal',
                cameraId: 'cam_a',
                cameraNome: 'A',
                tecnica: { iso: '800', frameRate: '24', diafragma: 'T2.8' },
                optica: { lentes: '35mm', filtros: '', matteBox: false },
                takes: [
                  { id: 'tk_a1', numero: '1', cartao: 'A012', clipSync: 'A012C001' },
                  {
                    id: 'tk_a2',
                    numero: '2',
                    cartao: 'A012',
                    clipSync: 'A012C002',
                    aprovado: true,
                  },
                ],
              },
            ],
          },
          { id: 'bl_b', letra: 'B', planos: [{ id: 'plano_b1', numero: '1', takes: [] }] },
          { id: 'bl_c', letra: 'C', planos: [{ id: 'plano_c1', numero: '1', takes: [] }] },
        ],
      },
    ],
    ...overrides,
  });
}

// ============================================================
// 1. Caminho completo v1 → v2 → plataforma
// ============================================================

const legacy = normalizeBoletim(v1);
const snap = mapBoletimToProduction(legacy, OPTS);

ok('produção nomeada pelo título', snap.production.name === 'Filme Antigo');
ok('produtora preservada', snap.production.company === 'Produtora X');
ok('diretor e DoP preservados', snap.production.director === 'Dir' && snap.production.dop === 'DoP');
ok('produção nasce provisória (só local)', snap.production.isProvisional === true);
ok('produção tem código de sala', /^FILMEA-[A-Z2-9]{4}$/.test(snap.production.joinCode));

ok('1 boletim = 1 diária', snap.shootingDays.length === 1);
const day = snap.shootingDays[0];
ok('data da diária preservada', day.date === '2026-05-29');
ok('número da diária preservado', day.dayNumber === '12');
ok('horários viram call/wrap', day.callTime === '07:00' && day.wrapTime === '18:00');
ok('almoço v1 parseado chega na diária', day.lunchStart === '14:00' && day.lunchEnd === '15:00');
ok('observações gerais preservadas', day.notes.includes('nota geral'));
ok('continuidade de cenasDoDia preservada', day.notes.includes('segue amanhã'));
ok('auditoria original da diária preservada', day.createdAt === '2026-05-29T10:00:00.000Z');

// Cena 18 bloco A + cena 17.1 bloco A (a normalização v1 cria o bloco A).
ok('2 cenas migradas', snap.scenes.length === 2);
ok('cena 18 / bloco A', snap.scenes[0].number === '18' && snap.scenes[0].block === 'A');
ok('cena 17.1 preservada', snap.scenes[1].number === '17.1');
ok('2 setups (um por plano)', snap.setups.length === 2);
ok('setup aponta para a diária', snap.setups[0].shootingDayId === day.id);
ok('observações do plano viram descrição do setup', snap.setups[0].description === 'cena principal');

ok('2 takes migrados', snap.takes.length === 2);
const take6 = snap.takes.find((t) => t.number === 6);
ok('take 6 existe com número inteiro', !!take6);
ok('aprovado vira CIRCLE', take6.status === 'CIRCLE');
const take1 = snap.takes.find((t) => t.number === 1);
ok('take não aprovado fica RECORDED', take1.status === 'RECORDED');

const cam6 = snap.cameraTakeData.find((d) => d.takeId === take6.id);
ok('approved é preservado além do status', cam6.approved === true);
ok('cartão v1 (cartaoRolo) chega no take', cam6.card === 'A004');
ok('nota operacional preservada', cam6.notes === 'Foco doce');
ok('técnica do plano vai para o take', cam6.config.iso === '640' && cam6.config.fps === '23.98');
ok('formatoGravacao vira codec', cam6.config.codec === 'R3D MQ');
ok('óptica preservada', cam6.config.lens === '25mm' && cam6.config.matteBox === true);

ok('câmera legada vira unidade de câmera', snap.cameraUnits.length === 1);
ok('unidade rotulada A', snap.cameraUnits[0].label === 'A');
ok('modelo da câmera preservado', snap.cameraUnits[0].model === 'RED V-Raptor');
ok('vínculo plano→câmera preservado', cam6.cameraUnitId === snap.cameraUnits[0].id);

ok('equipe vira membro provisório', snap.members.length === 1);
ok('membro sem conta ainda', snap.members[0].userId === null);
ok('membro é do departamento CAMERA', snap.members[0].department === 'CAMERA');
ok('função vira jobTitle', snap.members[0].jobTitle === 'Operador(a)');

ok('mídia vira equipamento', snap.equipment.length === 1);
ok('equipamento categorizado como MEDIA', snap.equipment[0].category === 'MEDIA');
ok('cartão vira apelido do equipamento', snap.equipment[0].nickname === 'A004');
ok('responsável preservado nas notas', snap.equipment[0].notes.includes('DIT'));
ok('equipamento atribuído à diária', snap.equipmentAssignments[0].shootingDayId === day.id);

// ============================================================
// 2. Idempotência — a garantia que torna a migração re-executável
// ============================================================

const again = mapBoletimToProduction(legacy, OPTS);
ok(
  'mapear duas vezes produz resultado idêntico',
  JSON.stringify(snap) === JSON.stringify(again),
);
ok('ids de cena estáveis', snap.scenes[0].id === again.scenes[0].id);
ok('ids de take estáveis', snap.takes[0].id === again.takes[0].id);
ok('id de produção estável', snap.production.id === again.production.id);

// ============================================================
// 3. Cena com múltiplos blocos → 24A / 24B / 24C (ADR-002)
// ============================================================

const v2 = makeV2();
const snapV2 = mapBoletimToProduction(v2, OPTS);

ok('3 blocos viram 3 cenas', snapV2.scenes.length === 3);
ok(
  'as três compartilham o número 24',
  snapV2.scenes.every((s) => s.number === '24'),
);
ok(
  'blocos A/B/C preservados',
  snapV2.scenes.map((s) => s.block).join('') === 'ABC',
);
ok('ids das cenas são distintos', new Set(snapV2.scenes.map((s) => s.id)).size === 3);
ok('cada bloco tem seu setup', snapV2.setups.length === 3);
ok(
  'setup do bloco A tem os 2 takes',
  snapV2.takes.filter((t) => t.setupId === snapV2.setups[0].id).length === 2,
);
ok('2 unidades de câmera (multicam)', snapV2.cameraUnits.length === 2);
ok(
  'labels A e B',
  snapV2.cameraUnits.map((c) => c.label).join('') === 'AB',
);

// ============================================================
// 4. Agrupamento de diárias em produções
// ============================================================

const dia10 = makeV2();
const dia11 = makeV2({ id: 'bol_v2_2', producao: { ...v2.producao, data: '2026-08-11' } });
const outroFilme = normalizeBoletim({
  id: 'bol_outro',
  producao: { tituloProjeto: 'Curta Y', produtora: 'Produtora Z', data: '2026-07-03' },
  cenas: [],
});

const groups = groupBoletins([dia10, dia11, outroFilme]);
ok('2 produções detectadas', groups.length === 2);
ok('Filme X juntou 2 diárias', groups[0].boletins.length === 2);
ok('Curta Y ficou separado', groups[1].name === 'Curta Y');

const produtos = mapBoletinsToProductions([dia10, dia11, outroFilme], OPTS);
ok('2 snapshots gerados', produtos.length === 2);
ok('Filme X tem 2 diárias', produtos[0].shootingDays.length === 2);
ok(
  'a mesma cena 24A NÃO é duplicada entre diárias',
  produtos[0].scenes.filter((s) => s.number === '24' && s.block === 'A').length === 1,
);
ok('cenas totais permanecem 3', produtos[0].scenes.length === 3);
ok(
  'cada diária tem os próprios setups',
  produtos[0].setups.length === 6 &&
    new Set(produtos[0].setups.map((s) => s.shootingDayId)).size === 2,
);
ok(
  'câmeras não duplicam entre diárias',
  produtos[0].cameraUnits.length === 2,
);

// Boletim sem título cai numa produção própria, não é descartado.
const semTitulo = normalizeBoletim({ id: 'bol_nt', producao: {}, cenas: [] });
const comSemTitulo = mapBoletinsToProductions([semTitulo], OPTS);
ok('boletim sem título vira produção nomeada', comSemTitulo[0].production.name === 'Boletins sem título');

// ============================================================
// 5. Colisão de data (segunda unidade) — nenhum boletim é descartado
// ============================================================

const mesmoDia = makeV2({ id: 'bol_v2_3' });
const doisNoMesmoDia = mapBoletinsToProductions([dia10, mesmoDia], OPTS);
ok('duas diárias na mesma data coexistem', doisNoMesmoDia[0].shootingDays.length === 2);
ok('primeira diária sem unidade', doisNoMesmoDia[0].shootingDays[0].unit === '');
ok('segunda diária vira unidade 2', doisNoMesmoDia[0].shootingDays[1].unit === '2');
ok(
  'diárias têm ids distintos',
  doisNoMesmoDia[0].shootingDays[0].id !== doisNoMesmoDia[0].shootingDays[1].id,
);

// ============================================================
// 6. Valores que não cabem no destino são preservados, não descartados
// ============================================================

const estranho = normalizeBoletim({
  id: 'bol_odd',
  producao: { tituloProjeto: 'Casos Estranhos', data: '2026-08-10' },
  cenas: [
    {
      id: 'cena_odd',
      numero: '5',
      blocos: [
        {
          id: 'bl_odd',
          letra: 'A',
          planos: [
            // Dois planos com o MESMO número dentro do mesmo bloco.
            {
              id: 'p1',
              numero: '1',
              takes: [
                { id: 'x1', numero: '1' },
                { id: 'x2', numero: '1' }, // número repetido
                { id: 'x3', numero: 'pickup' }, // não numérico
                { id: 'x4', numero: '' }, // vazio
              ],
            },
            { id: 'p2', numero: '1', takes: [] },
          ],
        },
      ],
    },
  ],
});
const snapOdd = mapBoletimToProduction(estranho, OPTS);

ok('planos com número repetido viram 2 setups', snapOdd.setups.length === 2);
ok(
  'códigos de setup ficam únicos',
  new Set(snapOdd.setups.map((s) => s.code)).size === 2,
);
ok('setup duplicado recebe sufixo', snapOdd.setups[1].code === '1-2');

const oddTakes = snapOdd.takes.filter((t) => t.setupId === snapOdd.setups[0].id);
ok('nenhum take é descartado', oddTakes.length === 4);
ok(
  'números de take ficam únicos',
  new Set(oddTakes.map((t) => t.number)).size === 4,
);
ok(
  'todo número de take é inteiro positivo',
  oddTakes.every((t) => Number.isSafeInteger(t.number) && t.number > 0),
);
const pickup = oddTakes.find((t) => t.notes.includes('pickup'));
ok('rótulo não numérico é preservado em nota', !!pickup);

// ============================================================
// 7. Verificação de contagens (etapa 6 da migração)
// ============================================================

const esperado = countBoletins([dia10, dia11]);
const obtido = countSnapshot(produtos[0]);
ok('contagem de diárias confere', esperado.shootingDays === obtido.shootingDays);
ok('contagem de cenas confere', esperado.scenes === obtido.scenes);
ok('contagem de setups confere', esperado.setups === obtido.setups);
ok('contagem de takes confere', esperado.takes === obtido.takes);
ok('contagem de aprovados confere', esperado.approvedTakes === obtido.approvedTakes);
ok('contagem de câmeras confere', esperado.cameraUnits === obtido.cameraUnits);

const esperadoV1 = countBoletins([legacy]);
const obtidoV1 = countSnapshot(snap);
ok(
  'contagens do boletim v1 conferem',
  JSON.stringify(esperadoV1) === JSON.stringify(obtidoV1),
);

// ============================================================
// 8. Nada de entrada vazia quebra o mapeador
// ============================================================

const vazio = mapBoletinsToProductions([], OPTS);
ok('lista vazia não gera produção', vazio.length === 0);

let failed = 0;
for (const c of checks) {
  if (!c.pass) failed++;
  console.log(`${c.pass ? '✓' : '✗'} ${c.name}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passaram.`);
process.exit(failed === 0 ? 0 : 1);
