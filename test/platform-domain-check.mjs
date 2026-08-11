// Regras de domínio da plataforma: herança entre takes, incremento, reset ao trocar
// de setup, permissões e ids determinísticos (§28, §29, §30, §5).
import {
  audit,
  createCameraTakeData,
  createSoundTakeData,
  createTake,
  emptyCameraConfig,
  generateJoinCode,
  inheritCameraFlat,
  inheritCameraTakeData,
  inheritSoundTakeData,
  isDeleted,
  nextTakeNumber,
  sceneLabel,
  setupLabel,
  softDelete,
  tracksFromTemplate,
} from '@/domain/platform/factory.ts';
import {
  canWriteDepartmentData,
  roleAtLeast,
  TAKE_KIND_LABEL,
  TAKE_KINDS,
  TAKE_STATUS_LABEL,
  TAKE_STATUSES,
} from '@/domain/platform/enums.ts';
import { deriveId, deriveJoinCode } from '@/domain/platform/derive-id.ts';

const NOW = '2026-08-10T12:00:00.000Z';
const ctx = { actorId: 'user_1', now: NOW };
const PROD = 'prod_1';

const checks = [];
const ok = (name, cond) => checks.push({ name, pass: !!cond });

// ---- Auditoria (§21) ----
const a = audit(ctx);
ok('audit carimba createdAt/updatedAt', a.createdAt === NOW && a.updatedAt === NOW);
ok('audit registra autoria', a.createdBy === 'user_1' && a.updatedBy === 'user_1');
ok('audit começa na versão 1', a.version === 1);
ok('audit nasce não-excluído', a.deletedAt === null);

const deleted = softDelete(createTake({ productionId: PROD, setupId: 's1', number: 1 }), ctx);
ok('softDelete marca deletedAt', deleted.deletedAt === NOW && isDeleted(deleted));
ok('softDelete registra quem excluiu', deleted.deletedBy === 'user_1');

// ---- Numeração de take (§30) ----
ok('setup sem takes começa no take 1', nextTakeNumber([]) === 1);
ok('próximo take = maior + 1', nextTakeNumber([{ number: 1 }, { number: 2 }]) === 3);
ok('lacuna não confunde o próximo', nextTakeNumber([{ number: 1 }, { number: 5 }]) === 6);
ok(
  'fora de ordem não confunde o próximo',
  nextTakeNumber([{ number: 7 }, { number: 2 }]) === 8,
);
// Trocar de setup (24B → 24C) devolve 1 porque o escopo é o setup — sem código especial.
ok('trocar de setup reseta o take para 1', nextTakeNumber([]) === 1);

// ---- Os dois eixos do take (ADR-029) ----
const takeNovo = createTake({ productionId: PROD, setupId: 's1', number: 1 }, ctx);
ok('take nasce julgado como RECORDED', takeNovo.status === 'RECORDED');
// Ninguém em set escolhe "sync" a cada tomada: é o padrão, e a natureza só é tocada
// quando o take foge do normal.
ok('take nasce com natureza SYNC', takeNovo.kind === 'SYNC');
// Um wild não faz o próximo take ser wild — a natureza é do take, não do setup.
const depoisDeUmWild = createTake({ productionId: PROD, setupId: 's1', number: 2 }, ctx);
ok('a natureza não vaza para o take seguinte', depoisDeUmWild.kind === 'SYNC');
ok(
  'julgamento e natureza são listas disjuntas',
  !TAKE_STATUSES.some((status) => TAKE_KINDS.includes(status)),
);
ok('julgamento ganhou HOLD', TAKE_STATUSES.includes('HOLD'));
ok(
  'os valores de natureza saíram do julgamento',
  !TAKE_STATUSES.includes('WILD') &&
    !TAKE_STATUSES.includes('ROOM_TONE') &&
    !TAKE_STATUSES.includes('FALSE_START'),
);
// A lacuna que o levantamento chamou de mais séria: dizer que o take existe e o som não.
ok('MOS existe no eixo de natureza', TAKE_KINDS.includes('MOS'));
ok(
  'todo valor de natureza tem rótulo',
  TAKE_KINDS.every((kind) => Boolean(TAKE_KIND_LABEL[kind])),
);
ok(
  'todo valor de julgamento tem rótulo',
  TAKE_STATUSES.every((status) => Boolean(TAKE_STATUS_LABEL[status])),
);

// ---- Herança de câmera (§29) ----
const take3 = createCameraTakeData({ productionId: PROD, takeId: 't3' }, ctx);
const previous = {
  ...take3,
  cameraUnitId: 'cam_a',
  cameraLabel: 'A',
  card: 'A012',
  roll: '004',
  volume: 'V1',
  fileName: 'A012C005_001',
  approved: true,
  status: 'CIRCLE',
  notes: 'foco doce',
  mediaNotes: 'cartão trocado',
  config: { ...emptyCameraConfig(), iso: '800', fps: '24', lens: '35mm', tStop: 'T2.8' },
};

const take4 = inheritCameraTakeData(previous, 't4', ctx);
ok('herda a câmera', take4.cameraUnitId === 'cam_a' && take4.cameraLabel === 'A');
ok('herda o cartão', take4.card === 'A012');
ok('herda o roll e o volume', take4.roll === '004' && take4.volume === 'V1');
ok('herda ISO/FPS/lente/T-stop', take4.config.iso === '800' && take4.config.fps === '24');
ok('herda a óptica', take4.config.lens === '35mm' && take4.config.tStop === 'T2.8');
ok('auto-incrementa o arquivo', take4.fileName === 'A012C005_002');
ok('NÃO herda a aprovação', take4.approved === false);
ok('NÃO herda o status', take4.status === null);
ok('NÃO herda as notas', take4.notes === '' && take4.mediaNotes === '');
ok('aponta para o novo take', take4.takeId === 't4');
ok('config é cópia, não referência', take4.config !== previous.config);

// §30 — trocar o cartão persiste para os próximos takes, sem estado global.
const take4ComCartaoNovo = { ...take4, card: 'A013' };
const take5 = inheritCameraTakeData(take4ComCartaoNovo, 't5', ctx);
ok('cartão novo persiste para o take seguinte', take5.card === 'A013');
ok('cartão antigo não volta', take5.card !== 'A012');

// ---- Herança de som (§29) ----
const som4 = {
  ...createSoundTakeData({ productionId: PROD, takeId: 't4' }, ctx),
  soundRoll: '004',
  fileName: '004_012',
  tcStart: '14:32:10:12',
  tcEnd: '14:32:58:00',
  circled: true,
  status: 'NG',
  ngReason: 'avião no meio',
  notes: 'avião',
};
const som5 = inheritSoundTakeData(som4, 't5', ctx);
ok('som herda o roll', som5.soundRoll === '004');
ok('som auto-incrementa o arquivo', som5.fileName === '004_013');
ok('som NÃO herda timecode', som5.tcStart === '' && som5.tcEnd === '');
// Julgamento não se herda: cada take é julgado por si. E desde ADR-029 a natureza nem
// mora aqui — é `Take.kind`, do take compartilhado.
ok(
  'som NÃO herda julgamento nem motivo de NG',
  som5.circled === false && som5.status === null && som5.ngReason === '',
);
ok(
  'a natureza saiu do som e virou eixo do take',
  som5.wild === undefined && som5.roomTone === undefined,
);
ok('som NÃO herda notas', som5.notes === '');

// ---- Tracks dinâmicas: sem limite de 4 (§11) ----
const template = [
  { index: 1, name: 'Boom', source: 'Boom', equipmentId: 'eq_416' },
  { index: 2, name: 'João', source: 'Lav', equipmentId: 'eq_4060a' },
  { index: 3, name: 'Maria', source: 'Lav', equipmentId: 'eq_4060b' },
  { index: 4, name: 'Plant', source: 'Plant', equipmentId: null },
  { index: 5, name: 'Carlos', source: 'Lav', equipmentId: null },
  { index: 6, name: 'Ambiente', source: 'Plant', equipmentId: null },
];
const tracks = tracksFromTemplate(template, PROD, 't5', ctx);
ok('template materializa todas as tracks (6 > 4)', tracks.length === 6);
ok('tracks mantêm índice e nome', tracks[5].index === 6 && tracks[5].name === 'Ambiente');
ok('tracks vinculam equipamento', tracks[0].equipmentId === 'eq_416');
ok('tracks apontam para o take', tracks[2].takeId === 't5');

// ---- Rótulos de set ----
ok('sceneLabel junta número e bloco', sceneLabel({ number: '24', block: 'B' }) === '24B');
ok('sceneLabel sem bloco', sceneLabel({ number: '17.1', block: '' }) === '17.1');
ok(
  'setupLabel mostra cena e setup',
  setupLabel({ number: '24', block: 'B' }, { code: 'C' }) === '24B / C',
);
ok(
  'setupLabel sem código cai na cena',
  setupLabel({ number: '24', block: 'B' }, { code: '' }) === '24B',
);

// ---- Papel × departamento (§5) ----
ok('OWNER ≥ ADMIN', roleAtLeast('OWNER', 'ADMIN'));
ok('ADMIN ≥ MEMBER', roleAtLeast('ADMIN', 'MEMBER'));
ok('MEMBER não é ADMIN', !roleAtLeast('MEMBER', 'ADMIN'));
ok('VIEWER não é MEMBER', !roleAtLeast('VIEWER', 'MEMBER'));
ok('papel se compara consigo mesmo', roleAtLeast('MEMBER', 'MEMBER'));
ok('CAMERA escreve dados de câmera', canWriteDepartmentData(['CAMERA'], 'CAMERA'));
ok('CAMERA não escreve dados de som', !canWriteDepartmentData(['CAMERA'], 'SOUND'));
ok(
  'departamento extra também autoriza',
  canWriteDepartmentData(['CAMERA', 'DIT'], 'DIT'),
);

// ---- Código de sala ----
const code = generateJoinCode('Filme X');
ok('joinCode tem prefixo do nome', code.startsWith('FILMEX-'));
ok('joinCode tem 4 caracteres de sufixo', code.split('-')[1].length === 4);
ok('joinCode sem caracteres ambíguos', !/[O0I1]/.test(code.split('-')[1]));
ok('joinCode de nome vazio usa SALA', generateJoinCode('').startsWith('SALA-'));
ok(
  'deriveJoinCode é determinístico',
  deriveJoinCode('Filme X', 'k') === deriveJoinCode('Filme X', 'k'),
);
ok(
  'deriveJoinCode muda com a chave',
  deriveJoinCode('Filme X', 'k1') !== deriveJoinCode('Filme X', 'k2'),
);

// ---- Ids determinísticos (base da idempotência da migração) ----
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/;
ok('deriveId tem formato de UUID', UUID_SHAPE.test(deriveId('take', 'abc')));
ok('deriveId é determinístico', deriveId('take', 'abc') === deriveId('take', 'abc'));
ok('deriveId separa namespaces', deriveId('take', 'abc') !== deriveId('setup', 'abc'));
// O separador impede que ('a','bc') colida com ('ab','c').
ok('deriveId não confunde a junção das partes', deriveId('a', 'bc') !== deriveId('ab', 'c'));

const seen = new Set();
for (let i = 0; i < 20000; i += 1) seen.add(deriveId('take', `id_${i}`));
ok('deriveId sem colisão em 20k ids', seen.size === 20000);

// ---- Herança sobre o formato plano do armazenamento (Fase 5) ----
const anterior = {
  id: 'antigo',
  takeId: 'take-1',
  version: 7,
  _dirty: 1,
  updatedAt: '2026-08-10T12:00:00Z',
  cameraUnitId: 'cam-a',
  card: 'A012',
  roll: '004',
  lens: '35mm',
  tStop: 'T2.8',
  iso: '800',
  fileName: 'A012C005_001',
  approved: true,
  status: 'CIRCLE',
  notes: 'avião no take',
  mediaNotes: 'cartão trocado',
};
const herdado = inheritCameraFlat(anterior);

ok(
  'a técnica inteira é herdada do take anterior',
  herdado.card === 'A012' &&
    herdado.roll === '004' &&
    herdado.lens === '35mm' &&
    herdado.tStop === 'T2.8' &&
    herdado.iso === '800' &&
    herdado.cameraUnitId === 'cam-a',
);
ok(
  'aprovação, status e notas NÃO são herdados',
  herdado.approved === false &&
    herdado.status === null &&
    herdado.notes === undefined &&
    herdado.mediaNotes === undefined,
);
ok('o sufixo do nome do arquivo incrementa', herdado.fileName === 'A012C005_002');
ok(
  'identidade e controle de versão não vazam para o take novo',
  herdado.id === undefined &&
    herdado.takeId === undefined &&
    herdado.version === undefined &&
    herdado._dirty === undefined &&
    herdado.updatedAt === undefined,
);

let failed = 0;
for (const c of checks) {
  if (!c.pass) failed++;
  console.log(`${c.pass ? '✓' : '✗'} ${c.name}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passaram.`);
process.exit(failed === 0 ? 0 : 1);
