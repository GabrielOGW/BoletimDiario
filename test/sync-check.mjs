/**
 * Verificação do sync contra o banco real (Fase 4).
 *
 * Cobre o que o servidor decide — compare-and-set por campo, idempotência, cursor — e as
 * funções puras do cliente. O que depende de IndexedDB e de duas abas de verdade
 * (fechar o PWA e reabrir, 50 operações offline saindo em ordem no aparelho) fica para o
 * Playwright da Fase 10; aqui prova-se a semântica, que é onde os erros são silenciosos.
 *
 * Como `test:sala`: exige `DATABASE_URL`, não entra em `npm test`, e roda com
 * `--conditions=react-server` por causa do `server-only`.
 */

import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config({ path: '.env' });

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.log('⏭  DATABASE_URL ausente — verificação de sync pulada.');
  process.exit(0);
}

process.env.DATABASE_URL = url;
const sql = neon(url);

const { pushOperations } = await import('@/lib/db/queries/sync');
const { pullChanges, loadSnapshot } = await import('@/lib/db/queries/sync-read');
const { deriveId } = await import('@/domain/platform/derive-id');
const { coalesceFields } = await import('@/lib/offline/outbox');
const { normalizeValue, SYNC_ENTITIES, SYNC_ENTITY_TYPES, ENTITY_BY_TABLE } = await import(
  '@/lib/contracts/sync'
);

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`✓ ${label}`);
  } else {
    failed += 1;
    console.error(`✗ ${label}`);
  }
}

const alice = { id: randomUUID(), nome: 'Alice (câmera)' };
const bruno = { id: randomUUID(), nome: 'Bruno (câmera)' };
const productionId = randomUUID();
const shootingDayId = randomUUID();

const op = (entityType, entityId, operation, fields) => ({
  id: randomUUID(),
  entityType,
  entityId,
  operation,
  fields,
  createdAt: new Date().toISOString(),
});

const push = (operations, actorId = alice.id) =>
  pushOperations({ productionId, actorId, operations });

async function cleanup() {
  await sql`delete from productions where id = ${productionId}`;
  for (const pessoa of [alice, bruno]) {
    await sql`delete from users where id = ${pessoa.id}`;
  }
}

async function run() {
  // ---- Funções puras: coalescência ----

  const primeiro = { notes: { de: 'a', para: 'ab' } };
  const segundo = { notes: { de: 'ab', para: 'abc' } };
  const terceiro = { notes: { de: 'abc', para: 'abcd' } };
  const fundido = coalesceFields(coalesceFields(primeiro, segundo), terceiro);

  check(
    'coalescência preserva o `de` original e substitui só o `para`',
    fundido.notes.de === 'a' && fundido.notes.para === 'abcd',
  );

  check(
    'campo novo entra inteiro na coalescência',
    coalesceFields(primeiro, { status: { de: 'RECORDED', para: 'CIRCLE' } }).status.de ===
      'RECORDED',
  );

  check(
    'normalização não confunde 5 com "5"',
    normalizeValue('int', 5) === normalizeValue('int', '5') &&
      normalizeValue('text', '') === null,
  );

  check(
    'o registro cobre o compartilhado e os três departamentos',
    Object.keys(SYNC_ENTITIES).join(',') ===
      'scene,setup,take,cameraUnit,cameraTakeData,soundDayConfig,soundTakeData,' +
        'soundTakeTrack,continuityTakeData,continuityProp,continuityWardrobe,' +
        'continuityHairMakeup,continuitySetDressing,dailyProgressReport',
  );

  // Toda tabela do registro tem de existir de verdade: um nome errado aqui não quebra
  // nada no build e some do pull em silêncio, que é o pior sintoma possível.
  for (const [tipo, entidade] of Object.entries(SYNC_ENTITIES)) {
    const [linha] = await sql`
      select count(*)::int as total from information_schema.tables
       where table_name = ${entidade.table}
    `;
    check(`a tabela de ${tipo} existe (${entidade.table})`, linha.total === 1);
  }

  // E toda coluna declarada também. `to_column` do contrato precisa bater com o banco.
  for (const [tipo, entidade] of Object.entries(SYNC_ENTITIES)) {
    const colunas = Object.keys(entidade.fields).map((campo) =>
      campo.replace(/[A-Z]/g, (letra) => `_${letra.toLowerCase()}`),
    );
    const [linha] = await sql`
      select count(*)::int as total from information_schema.columns
       where table_name = ${entidade.table}
         and column_name = any(${colunas})
    `;
    check(`todo campo de ${tipo} tem coluna`, linha.total === colunas.length);
  }

  check(
    'booleano não some: `false` é valor, não ausência',
    normalizeValue('bool', false) === 'false' &&
      normalizeValue('bool', 'false') === 'false' &&
      normalizeValue('bool', true) === 'true',
  );

  // ---- Cenário ----

  for (const pessoa of [alice, bruno]) {
    await sql`
      insert into users (id, name, email)
      values (${pessoa.id}, ${pessoa.nome}, ${`sync-${pessoa.id}@exemplo.test`})
    `;
  }

  await sql`
    insert into productions (id, name, join_code, created_by, updated_by)
    values (${productionId}, 'Filme de Sync', ${`SYNC-${productionId.slice(0, 4).toUpperCase()}`},
            ${alice.id}, ${alice.id})
  `;
  await sql`
    insert into production_members (id, production_id, user_id, role, department, created_by, updated_by)
    values (${randomUUID()}, ${productionId}, ${alice.id}, 'OWNER', 'CAMERA', ${alice.id}, ${alice.id}),
           (${randomUUID()}, ${productionId}, ${bruno.id}, 'MEMBER', 'CAMERA', ${alice.id}, ${alice.id})
  `;
  await sql`
    insert into shooting_days (id, production_id, date, created_by, updated_by)
    values (${shootingDayId}, ${productionId}, '2026-08-10', ${alice.id}, ${alice.id})
  `;

  const sceneId = deriveId('scene', productionId, '24', 'B');
  const setupId = deriveId('setup', sceneId, shootingDayId, 'C');

  const criacao = await push([
    op('scene', sceneId, 'CREATE', {
      number: { de: null, para: '24' },
      block: { de: null, para: 'B' },
    }),
    op('setup', setupId, 'CREATE', {
      sceneId: { de: null, para: sceneId },
      shootingDayId: { de: null, para: shootingDayId },
      code: { de: null, para: 'C' },
      sortOrder: { de: null, para: 0 },
    }),
  ]);

  check(
    'CREATE de cena e setup na ordem aplica os dois',
    criacao.every((result) => result.status === 'APPLIED'),
  );

  // ---- Idempotência ----

  const takeId = deriveId('take', setupId, '4');
  const criaTake = op('take', takeId, 'CREATE', {
    setupId: { de: null, para: setupId },
    number: { de: null, para: 4 },
    status: { de: null, para: 'RECORDED' },
  });

  const primeiraVez = await push([criaTake]);
  const segundaVez = await push([criaTake]);

  const [{ total: quantosTakes }] = await sql`
    select count(*)::int as total from takes where setup_id = ${setupId}
  `;

  check(
    'a mesma operação enviada duas vezes aplica uma vez',
    quantosTakes === 1 && primeiraVez[0].status === segundaVez[0].status,
  );

  // ---- Dois dispositivos criam o mesmo take ----

  const outroDispositivo = op('take', deriveId('take', setupId, '4'), 'CREATE', {
    setupId: { de: null, para: setupId },
    number: { de: null, para: 4 },
    status: { de: null, para: 'RECORDED' },
  });
  await push([outroDispositivo], bruno.id);

  const [{ total: aindaUm }] = await sql`
    select count(*)::int as total from takes where setup_id = ${setupId}
  `;
  check('dois dispositivos criam o take 4 e sai um take só', aindaUm === 1);

  // ---- Merge por campo ----

  const merge = await push([
    op('take', takeId, 'UPDATE', { status: { de: 'RECORDED', para: 'CIRCLE' } }),
  ]);
  const mergeBruno = await push(
    [op('take', takeId, 'UPDATE', { notes: { de: null, para: 'copo na mão direita' } })],
    bruno.id,
  );

  const [take] = await sql`select status, notes from takes where id = ${takeId}`;

  check(
    'campos diferentes do mesmo take fazem merge automático',
    merge[0].status === 'APPLIED' &&
      mergeBruno[0].status === 'APPLIED' &&
      take.status === 'CIRCLE' &&
      take.notes === 'copo na mão direita',
  );

  // ---- Mesmo campo: conflito ----

  const conflito = await push(
    [op('take', takeId, 'UPDATE', { status: { de: 'RECORDED', para: 'NG' } })],
    bruno.id,
  );

  const [depoisDoConflito] = await sql`select status from takes where id = ${takeId}`;

  check(
    'o mesmo campo com base velha vira conflito e não aplica',
    conflito[0].status === 'CONFLICT' &&
      conflito[0].conflicts[0].field === 'status' &&
      conflito[0].conflicts[0].atual === 'CIRCLE' &&
      depoisDoConflito.status === 'CIRCLE',
  );

  // Autoria é do registro, não do campo: `updated_by` é uma coluna só, e quem tocou no
  // take por último foi o Bruno (nas notas). O rótulo do conflito acerta o caso comum.
  check(
    'o conflito diz quem escreveu por último no registro',
    conflito[0].conflicts[0].atualPor === bruno.nome,
  );

  // ---- Conflito num campo não bloqueia os outros ----

  const parcial = await push(
    [
      op('take', takeId, 'UPDATE', {
        status: { de: 'RECORDED', para: 'NG' },
        notes: { de: 'copo na mão direita', para: 'copo na mão esquerda' },
      }),
    ],
    bruno.id,
  );

  const [aposParcial] = await sql`select status, notes from takes where id = ${takeId}`;

  check(
    'conflito de um campo não impede os outros do mesmo push',
    parcial[0].status === 'PARTIAL' &&
      parcial[0].applied.includes('notes') &&
      aposParcial.notes === 'copo na mão esquerda' &&
      aposParcial.status === 'CIRCLE',
  );

  // ---- `atual == para`: ninguém mexeu de verdade ----

  const eco = await push([
    op('take', takeId, 'UPDATE', { status: { de: 'RECORDED', para: 'CIRCLE' } }),
  ]);
  check(
    'valor que já é o desejado é ignorado, não vira conflito',
    eco[0].status === 'APPLIED' && eco[0].conflicts.length === 0,
  );

  // ---- Lote em ordem ----

  const lote = [];
  for (let numero = 5; numero <= 54; numero += 1) {
    const id = deriveId('take', setupId, String(numero));
    lote.push(
      op('take', id, 'CREATE', {
        setupId: { de: null, para: setupId },
        number: { de: null, para: numero },
        status: { de: null, para: 'RECORDED' },
      }),
    );
  }

  const resultados = await push(lote);
  const [{ total: cinquentaUm }] = await sql`
    select count(*)::int as total from takes where setup_id = ${setupId}
  `;

  check(
    '50 operações acumuladas offline entram todas, na ordem',
    resultados.every((result) => result.status === 'APPLIED') && cinquentaUm === 51,
  );

  // ---- Exclusão como campo ----

  const apagou = await push([
    op('take', takeId, 'DELETE', {
      deletedAt: { de: null, para: new Date().toISOString() },
    }),
  ]);
  check('soft delete passa pelo mesmo caminho e aplica', apagou[0].status === 'APPLIED');

  const editaApagado = await push(
    [op('take', takeId, 'UPDATE', { notes: { de: 'copo na mão esquerda', para: 'tentativa' } })],
    bruno.id,
  );
  const conflitoDeExclusao = await push(
    [op('take', takeId, 'UPDATE', { deletedAt: { de: null, para: null } })],
    bruno.id,
  );

  check(
    'editar campo de registro apagado ainda funciona — o conteúdo não se perde',
    editaApagado[0].status === 'APPLIED',
  );
  check(
    'restaurar sobre exclusão de outro é conflito, com o valor atual à mão',
    conflitoDeExclusao[0].status === 'CONFLICT' &&
      conflitoDeExclusao[0].conflicts[0].field === 'deletedAt' &&
      conflitoDeExclusao[0].conflicts[0].atual !== null,
  );

  // ---- Campo fora do contrato ----

  const invalido = await push([
    op('take', takeId, 'UPDATE', { productionId: { de: null, para: randomUUID() } }),
  ]);
  check(
    'campo fora do contrato é recusado, não escrito',
    invalido[0].status === 'FAILED' && /não sincronizável/.test(invalido[0].reason),
  );

  // ---- Câmera (Fase 5): o tipo booleano no compare-and-set ----

  const cameraUnitId = deriveId('cameraUnit', productionId, 'A');
  const camTakeId = deriveId('take', setupId, '5');
  const camDataId = deriveId('cameraTakeData', camTakeId, cameraUnitId);

  const camera = await push([
    op('cameraUnit', cameraUnitId, 'CREATE', {
      label: { de: null, para: 'A' },
      model: { de: null, para: 'ARRI Alexa 35' },
    }),
    op('cameraTakeData', camDataId, 'CREATE', {
      takeId: { de: null, para: camTakeId },
      cameraUnitId: { de: null, para: cameraUnitId },
      card: { de: null, para: 'A012' },
      lens: { de: null, para: '35mm' },
      approved: { de: null, para: false },
    }),
  ]);

  check(
    'câmera e dados de câmera do take entram pelo mesmo caminho',
    camera.every((result) => result.status === 'APPLIED'),
  );

  const aprova = await push([
    op('cameraTakeData', camDataId, 'UPDATE', { approved: { de: false, para: true } }),
  ]);
  const [aprovado] = await sql`select approved from camera_take_data where id = ${camDataId}`;

  const desaprova = await push([
    op('cameraTakeData', camDataId, 'UPDATE', { approved: { de: true, para: false } }),
  ]);
  const [desaprovado] = await sql`
    select approved from camera_take_data where id = ${camDataId}
  `;

  check(
    'o toggle "Aprovado pelo diretor" liga e desliga pelo compare-and-set',
    aprova[0].status === 'APPLIED' &&
      aprovado.approved === true &&
      desaprova[0].status === 'APPLIED' &&
      desaprovado.approved === false,
  );

  const conflitoBooleano = await push(
    [op('cameraTakeData', camDataId, 'UPDATE', { approved: { de: true, para: true } })],
    bruno.id,
  );
  check(
    'booleano com base velha conflita como qualquer outro campo',
    conflitoBooleano[0].status === 'CONFLICT' &&
      conflitoBooleano[0].conflicts[0].atual === false,
  );

  // ---- Cursor ----

  const primeiraPagina = await pullChanges({ productionId, since: 0, limit: 10 });
  check(
    'o pull pagina e o cursor cobre tudo que veio na página',
    primeiraPagina.hasMore === true &&
      primeiraPagina.changes.length > 0 &&
      primeiraPagina.changes.every((change) => change.seq <= primeiraPagina.cursor),
  );

  // A produção, os membros e a diária também escrevem no log e **não** são entidades do
  // protocolo: são editados fora da fronteira. O cursor tem que avançar por cima delas,
  // senão a primeira escrita de sala travaria o pull de todo mundo para sempre.
  // A verificação olha para o log em vez de contar itens na página: contar dependia de
  // quantas escritas de sala caíram nos dez primeiros `seq`, o que varia — e um teste que
  // varia é um teste que um dia falha sozinho e ensina a ignorar a suíte.
  const tabelasNoLog = await sql`
    select distinct entity_type from sync_log
     where production_id = ${productionId} and seq <= ${primeiraPagina.cursor}
  `;
  const foraDoProtocolo = tabelasNoLog
    .map((linha) => linha.entity_type)
    .filter((tabela) => !ENTITY_BY_TABLE[tabela]);

  check(
    'entidade fora do protocolo é ignorada sem travar o cursor',
    foraDoProtocolo.length > 0 &&
      primeiraPagina.changes.every((change) => SYNC_ENTITY_TYPES.includes(change.entityType)),
  );

  const repetida = await pullChanges({ productionId, since: 0, limit: 10 });
  check(
    'pull interrompido retoma do mesmo ponto sem duplicar',
    repetida.changes.map((c) => c.seq).join(',') ===
      primeiraPagina.changes.map((c) => c.seq).join(','),
  );

  const continuacao = await pullChanges({
    productionId,
    since: primeiraPagina.cursor,
    limit: 500,
  });
  check(
    'a continuação não repete nada da página anterior',
    continuacao.changes.every((change) => change.seq > primeiraPagina.cursor),
  );

  const semNovidade = await pullChanges({
    productionId,
    since: continuacao.cursor,
    limit: 500,
  });
  check(
    'pull sem novidade volta vazio e mantém o cursor',
    semNovidade.changes.length === 0 && semNovidade.cursor === continuacao.cursor,
  );

  const mudancaDeTake = continuacao.changes
    .concat(primeiraPagina.changes)
    .find((change) => change.entityType === 'take');
  check(
    'a mudança traz o estado atual da entidade, não o payload do log',
    Boolean(mudancaDeTake?.data?.id) && typeof mudancaDeTake.version === 'number',
  );

  // ---- Snapshot ----

  const snapshot = await loadSnapshot({ productionId, shootingDayId });
  check(
    'o snapshot traz o dia, as cenas, os setups e os takes',
    snapshot.shootingDay.date === '2026-08-10' &&
      snapshot.scenes.length === 1 &&
      snapshot.setups.length === 1 &&
      snapshot.takes.length === 51,
  );
  check(
    'o snapshot traz os membros e o cursor da produção',
    snapshot.members.length === 2 && snapshot.cursor > 0,
  );

  // ---- Fase 7: continuidade no protocolo ----

  const continuidadeId = deriveId('continuityTakeData', takeId);
  const anotacao = await push([
    op('continuityTakeData', continuidadeId, 'CREATE', {
      takeId: { de: null, para: takeId },
      selected: { de: null, para: true },
      action: { de: null, para: 'João entra pela esquerda' },
    }),
  ]);
  check('a continuidade de ação entra pelo push', anotacao[0].status === 'APPLIED');

  // Câmera e Continuidade no mesmo take não conflitam: são tabelas diferentes. É a
  // modelagem eliminando o conflito antes de qualquer estratégia de resolução.
  const eyeline = await push([
    op('continuityTakeData', continuidadeId, 'UPDATE', {
      eyeline: { de: null, para: 'Olha para fora do quadro, à direita' },
    }),
  ]);
  check('campo de continuidade faz merge sem conflito', eyeline[0].status === 'APPLIED');

  const propId = deriveId('continuityProp', sceneId, '', '', 'copo');
  const propCriada = await push([
    op('continuityProp', propId, 'CREATE', {
      sceneId: { de: null, para: sceneId },
      name: { de: null, para: 'Copo' },
      state: { de: null, para: '50% cheio' },
    }),
  ]);
  check('item de estado preso à cena entra pelo push', propCriada[0].status === 'APPLIED');

  // Duas pessoas anotando "Copo" na mesma cena, cada uma sem rede, convergem para o mesmo
  // registro — é o id derivado da chave natural fazendo colisão virar convergência.
  const mesmaProp = await push(
    [
      op('continuityProp', deriveId('continuityProp', sceneId, '', '', 'copo'), 'CREATE', {
        sceneId: { de: null, para: sceneId },
        name: { de: null, para: 'Copo' },
      }),
    ],
    bruno.id,
  );
  const [{ total: quantosCopos }] = await sql`
    select count(*)::int as total from continuity_props
     where production_id = ${productionId} and scene_id = ${sceneId}
  `;
  check(
    'dois dispositivos anotando o mesmo objeto criam um item só',
    quantosCopos === 1 && mesmaProp[0].status !== 'CONFLICT',
  );

  const relatorioId = deriveId('dailyProgressReport', shootingDayId);
  const relatorio = await push([
    op('dailyProgressReport', relatorioId, 'CREATE', {
      shootingDayId: { de: null, para: shootingDayId },
      pagesShot: { de: null, para: '2 4/8' },
    }),
  ]);
  check('o relatório de progresso entra pelo push', relatorio[0].status === 'APPLIED');

  const comContinuidade = await loadSnapshot({ productionId, shootingDayId });
  check(
    'o snapshot traz a continuidade de ação da diária',
    comContinuidade.continuityTakeData.length === 1 &&
      comContinuidade.continuityTakeData[0].action === 'João entra pela esquerda',
  );
  // O valor da continuidade é atravessar dias: o item preso à cena precisa chegar mesmo
  // quando a cena for rodada de novo em outra diária.
  check(
    'o snapshot traz os itens de estado presos à cena',
    comContinuidade.continuityProps.length === 1 &&
      comContinuidade.continuityProps[0].state === '50% cheio',
  );
  check(
    'o snapshot traz o relatório de progresso da diária',
    comContinuidade.dailyProgressReport.length === 1 &&
      comContinuidade.dailyProgressReport[0].pagesShot === '2 4/8',
  );

  const outroDia = randomUUID();
  await sql`
    insert into shooting_days (id, production_id, date, created_by, updated_by)
    values (${outroDia}, ${productionId}, '2026-08-12', ${alice.id}, ${alice.id})
  `;
  const snapshotDeOutroDia = await loadSnapshot({
    productionId,
    shootingDayId: outroDia,
  });
  check(
    'a cena rodada em outro dia traz o estado anotado antes',
    snapshotDeOutroDia.continuityProps.length === 1,
  );
  // O balanço é de **uma** diária: o do dia 10 não pode aparecer no dia 12.
  check(
    'o relatório de progresso não vaza para outra diária',
    snapshotDeOutroDia.dailyProgressReport.length === 0,
  );
}

try {
  await run();
} catch (error) {
  failed += 1;
  console.error('✗ erro inesperado:', error.message);
} finally {
  await cleanup();
}

console.log(`\n${passed}/${passed + failed} checks passaram.`);
process.exit(failed === 0 ? 0 : 1);
