/**
 * Verificação do schema contra o banco real.
 *
 * Não entra em `npm test`: exige rede e `DATABASE_URL`. As outras três suítes rodam
 * offline, e isso é proposital — o dia em que a suíte principal precisar de banco é o
 * dia em que ela para de ser rodada.
 *
 * Prova o que só o banco pode provar: triggers, constraints e tipo de coluna. Tudo
 * acontece dentro de uma produção descartável, apagada no fim mesmo se algo falhar.
 */

import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config({ path: '.env' });

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.log('⏭  DATABASE_URL ausente — verificação de banco pulada.');
  process.exit(0);
}

const sql = neon(url);

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

const ids = {
  user: randomUUID(),
  production: randomUUID(),
  day: randomUUID(),
  scene: randomUUID(),
  setup: randomUUID(),
  take: randomUUID(),
};

async function cleanup() {
  await sql`delete from productions where id = ${ids.production}`;
  await sql`delete from users where id = ${ids.user}`;
}

async function run() {
  await sql`
    insert into users (id, name, email)
    values (${ids.user}, 'Verificação', ${`check-${ids.user}@exemplo.test`})
  `;

  // ---- Estrutura ----

  const [dateColumn] = await sql`
    select data_type from information_schema.columns
    where table_name = 'shooting_days' and column_name = 'date'
  `;
  check('shooting_days.date é date, não timestamp', dateColumn?.data_type === 'date');

  const [createdAtColumn] = await sql`
    select data_type from information_schema.columns
    where table_name = 'takes' and column_name = 'created_at'
  `;
  check(
    'auditoria usa timestamptz',
    createdAtColumn?.data_type === 'timestamp with time zone',
  );

  const [photos] = await sql`
    select count(*)::int as n from information_schema.tables where table_name = 'photos'
  `;
  check('não existe tabela photos', photos.n === 0);

  const missingScope = await sql`
    select t.table_name from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name in ('scenes','setups','takes','camera_take_data','sound_take_data',
                           'continuity_take_data','equipment','equipment_assignments')
      and not exists (
        select 1 from information_schema.columns c
        where c.table_name = t.table_name and c.column_name = 'production_id'
      )
  `;
  check('toda tabela de conteúdo tem production_id', missingScope.length === 0);

  // `information_schema.triggers` rende uma linha POR EVENTO — um trigger de
  // `insert or update` aparece duas vezes. Contar nomes distintos conta triggers.
  const [syncTriggers] = await sql`
    select count(distinct trigger_name)::int as n from information_schema.triggers
    where trigger_schema = 'public' and trigger_name like '%_sync_log'
  `;
  check('18 tabelas de domínio escrevem no sync_log', syncTriggers.n === 18);

  const [touchTriggers] = await sql`
    select count(distinct trigger_name)::int as n from information_schema.triggers
    where trigger_schema = 'public' and trigger_name like '%_touch'
  `;
  check('18 tabelas de domínio incrementam version', touchTriggers.n === 18);

  // ---- Comportamento ----

  await sql`
    insert into productions (id, name, join_code, created_by)
    values (${ids.production}, 'Produção de verificação', ${`CHK-${ids.production.slice(0, 8)}`}, ${ids.user})
  `;
  await sql`
    insert into shooting_days (id, production_id, date, created_by)
    values (${ids.day}, ${ids.production}, '2026-08-10', ${ids.user})
  `;
  await sql`
    insert into scenes (id, production_id, number, block, created_by)
    values (${ids.scene}, ${ids.production}, '24', 'B', ${ids.user})
  `;
  await sql`
    insert into setups (id, production_id, scene_id, shooting_day_id, code, created_by)
    values (${ids.setup}, ${ids.production}, ${ids.scene}, ${ids.day}, 'C', ${ids.user})
  `;
  await sql`
    insert into takes (id, production_id, setup_id, number, created_by)
    values (${ids.take}, ${ids.production}, ${ids.setup}, 4, ${ids.user})
  `;

  const [created] = await sql`select version from takes where id = ${ids.take}`;
  check('take nasce na versão 1', created.version === 1);

  const [logCreate] = await sql`
    select operation, entity_type from sync_log
    where entity_id = ${ids.take} order by seq desc limit 1
  `;
  check('insert registra CREATE no sync_log', logCreate?.operation === 'CREATE');
  check('entity_type é o nome da tabela', logCreate?.entity_type === 'takes');

  await sql`update takes set notes = 'primeira nota' where id = ${ids.take}`;
  const [updated] = await sql`select version, updated_at, created_at from takes where id = ${ids.take}`;
  check('update incrementa version para 2', updated.version === 2);
  check('update move updated_at', updated.updated_at > updated.created_at);

  const [logUpdate] = await sql`
    select operation, version from sync_log where entity_id = ${ids.take} order by seq desc limit 1
  `;
  check('update registra UPDATE no sync_log', logUpdate?.operation === 'UPDATE');
  check('sync_log guarda a versão resultante', logUpdate?.version === 2);

  await sql`update takes set deleted_at = now(), deleted_by = ${ids.user} where id = ${ids.take}`;
  const [logDelete] = await sql`
    select operation from sync_log where entity_id = ${ids.take} order by seq desc limit 1
  `;
  check('soft delete registra DELETE, não UPDATE', logDelete?.operation === 'DELETE');

  const [stillThere] = await sql`select id from takes where id = ${ids.take}`;
  check('soft delete não remove a linha', Boolean(stillThere));

  // ---- Chaves naturais ----

  let rejected = false;
  try {
    await sql`
      insert into takes (id, production_id, setup_id, number, created_by)
      values (${randomUUID()}, ${ids.production}, ${ids.setup}, 4, ${ids.user})
    `;
  } catch {
    rejected = true;
  }
  check('take 4 duplicado no mesmo setup é rejeitado pelo BANCO', rejected);

  let sceneRejected = false;
  try {
    await sql`
      insert into scenes (id, production_id, number, block, created_by)
      values (${randomUUID()}, ${ids.production}, '24', 'B', ${ids.user})
    `;
  } catch {
    sceneRejected = true;
  }
  check('cena 24B duplicada na mesma produção é rejeitada', sceneRejected);

  let scopeRejected = false;
  try {
    await sql`
      insert into continuity_props (id, production_id, name, created_by)
      values (${randomUUID()}, ${ids.production}, 'Copo sem escopo', ${ids.user})
    `;
  } catch {
    scopeRejected = true;
  }
  check('item de continuidade sem cena/setup/take é rejeitado', scopeRejected);

  // ---- Fuso ----
  // A diária é dia civil. Lida de um fuso a oeste, precisa continuar sendo o mesmo dia —
  // é exatamente onde um timestamptz produziria o boletim no dia errado (R9).

  await sql`set time zone 'Pacific/Kiritimati'`;
  const [farEast] = await sql`select date::text as d from shooting_days where id = ${ids.day}`;
  await sql`set time zone 'Pacific/Midway'`;
  const [farWest] = await sql`select date::text as d from shooting_days where id = ${ids.day}`;
  await sql`set time zone 'UTC'`;
  check(
    'data da diária não muda com o fuso da sessão',
    farEast.d === '2026-08-10' && farWest.d === '2026-08-10',
  );

  // ---- Cursor ----

  const cursor = await sql`
    select seq from sync_log where production_id = ${ids.production} order by seq
  `;
  const monotonic = cursor.every((row, i) => i === 0 || Number(row.seq) > Number(cursor[i - 1].seq));
  check('sync_log é estritamente crescente', cursor.length > 0 && monotonic);

  await verificaEixos();
}

/**
 * Os dois eixos do take (ADR-029, migrations 0005 e 0006).
 *
 * Verificação de **schema**, não de linha: o que interessa aqui é que o banco recuse o
 * eixo errado por tipo, e não que a aplicação lembre de validar.
 */
async function verificaEixos() {
  const [status] = await sql`
    select array_agg(e.enumlabel order by e.enumsortorder)::text[] as valores
      from pg_type t join pg_enum e on e.enumtypid = t.oid
     where t.typname = 'take_status'
  `;
  const [kind] = await sql`
    select array_agg(e.enumlabel order by e.enumsortorder)::text[] as valores
      from pg_type t join pg_enum e on e.enumtypid = t.oid
     where t.typname = 'take_kind'
  `;

  check(
    'take_status é só julgamento, com HOLD',
    status.valores.join(',') === 'RECORDED,CIRCLE,HOLD,NG,PARTIAL',
  );
  check('take_kind existe com MOS', (kind?.valores ?? []).includes('MOS'));
  check(
    'a natureza saiu do julgamento',
    !status.valores.includes('WILD') && !status.valores.includes('ROOM_TONE'),
  );

  let recusou = false;
  try {
    await sql`select 'WILD'::take_status`;
  } catch {
    recusou = true;
  }
  check('o banco recusa natureza no campo de julgamento', recusou);

  const [takeKind] = await sql`
    select count(*)::int as total from information_schema.columns
     where table_name = 'takes' and column_name = 'kind'
  `;
  check('takes.kind existe', takeKind.total === 1);

  const [flags] = await sql`
    select count(*)::int as total from information_schema.columns
     where table_name = 'sound_take_data'
       and column_name in ('wild', 'room_tone', 'wild_lines', 'false_start')
  `;
  check('as flags de natureza saíram do som', flags.total === 0);

  const [motivos] = await sql`
    select count(*)::int as total from information_schema.columns
     where column_name = 'ng_reason'
       and table_name in ('camera_take_data', 'sound_take_data', 'continuity_take_data')
  `;
  check('os três departamentos têm motivo de NG', motivos.total === 3);

  const [custodia] = await sql`
    select count(*)::int as total from information_schema.columns
     where table_name = 'sound_day_config'
       and column_name in ('tc_jam_at', 'user_bits', 'media_copies', 'media_verified')
  `;
  check('a custódia do áudio tem as quatro colunas', custodia.total === 4);
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
