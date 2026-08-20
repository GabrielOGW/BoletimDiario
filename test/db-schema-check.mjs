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
  check('19 tabelas de domínio escrevem no sync_log', syncTriggers.n === 19);

  const [touchTriggers] = await sql`
    select count(distinct trigger_name)::int as n from information_schema.triggers
    where trigger_schema = 'public' and trigger_name like '%_touch'
  `;
  check('19 tabelas de domínio incrementam version', touchTriggers.n === 19);

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

  // ---- Fase 7: Relatório de Progresso da Diária ----

  const [humanos] = await sql`
    select count(*)::int as total from information_schema.columns
     where table_name = 'daily_progress_report'
       and column_name in ('first_take_at', 'pages_shot', 'estimated_minutes',
                           'scenes_covered', 'scenes_partial', 'scenes_skipped',
                           'scenes_added', 'notes', 'signed_by')
  `;
  check('o relatório de progresso tem os nove campos de mão humana', humanos.total === 9);

  // O que é derivável não tem coluna (ADR-034): dois números para o mesmo fato acabam
  // divergindo, e o guardado é sempre o mais velho dos dois.
  const [derivados] = await sql`
    select count(*)::int as total from information_schema.columns
     where table_name = 'daily_progress_report'
       and column_name in ('take_count', 'setup_count', 'scene_count', 'cards', 'rolls')
  `;
  check('o que é derivado não virou coluna', derivados.total === 0);

  const progressoId = randomUUID();
  await sql`
    insert into daily_progress_report (id, production_id, shooting_day_id, pages_shot, created_by)
    values (${progressoId}, ${ids.production}, ${ids.day}, '2 4/8', ${ids.user})
  `;

  const [logCriacao] = await sql`
    select count(*)::int as total from sync_log
     where entity_type = 'daily_progress_report' and entity_id = ${progressoId}
       and operation = 'CREATE'
  `;
  check('a criação do relatório entra no sync_log', logCriacao.total === 1);

  await sql`
    update daily_progress_report set notes = 'Choveu depois do almoço'
     where id = ${progressoId}
  `;

  const [versao] = await sql`
    select version from daily_progress_report where id = ${progressoId}
  `;
  check('o relatório incrementa version no update', versao.version === 2);

  const [logUpdate] = await sql`
    select count(*)::int as total from sync_log
     where entity_type = 'daily_progress_report' and entity_id = ${progressoId}
       and operation = 'UPDATE'
  `;
  check('o update do relatório entra no sync_log', logUpdate.total === 1);

  // Uma diária tem um balanço, não dois: a chave natural é o que faz duas pessoas
  // abrindo o relatório ao mesmo tempo convergirem em vez de criarem dois.
  let recusouSegundo = false;
  try {
    await sql`
      insert into daily_progress_report (id, production_id, shooting_day_id, created_by)
      values (${randomUUID()}, ${ids.production}, ${ids.day}, ${ids.user})
    `;
  } catch {
    recusouSegundo = true;
  }
  check('o banco recusa dois relatórios para a mesma diária', recusouSegundo);

  await sql`
    update daily_progress_report set deleted_at = now() where id = ${progressoId}
  `;

  const [logDelete] = await sql`
    select count(*)::int as total from sync_log
     where entity_type = 'daily_progress_report' and entity_id = ${progressoId}
       and operation = 'DELETE'
  `;
  check('o soft delete do relatório vira DELETE no log', logDelete.total === 1);

  // ---- Fase 10: o contador do rate limit ----

  const colunasDoLimite = await sql`
    select column_name, data_type from information_schema.columns
     where table_name = 'rate_limits'
     order by column_name
  `;
  const tipoDe = (nome) =>
    colunasDoLimite.find((coluna) => coluna.column_name === nome)?.data_type;

  check('a tabela rate_limits existe', colunasDoLimite.length === 4);
  check('a chave do limite é texto', tipoDe('key') === 'text');
  check('a contagem é inteira', tipoDe('count') === 'integer');
  // A Better Auth grava epoch em milissegundos. `integer` estouraria em 1970+24 dias, e
  // `timestamptz` obrigaria a traduzir nos dois sentidos a cada requisição.
  check('last_request é bigint, não timestamp', tipoDe('last_request') === 'bigint');

  const [chaveUnica] = await sql`
    select count(*)::int as total
      from information_schema.table_constraints c
      join information_schema.key_column_usage k
        on k.constraint_name = c.constraint_name
     where c.table_name = 'rate_limits'
       and c.constraint_type = 'UNIQUE'
       and k.column_name = 'key'
  `;
  // Sem a unicidade, duas requisições simultâneas criariam duas linhas para a mesma
  // chave — e o limite passaria a valer o dobro exatamente sob carga, que é quando ele
  // precisa valer.
  check('a chave do limite é única', chaveUnica.total === 1);

  const [limiteSemSync] = await sql`
    select count(distinct trigger_name)::int as total from information_schema.triggers
     where event_object_table = 'rate_limits'
  `;
  // Não é tabela de domínio: contador de tentativa não sincroniza para aparelho nenhum.
  check('rate_limits não tem trigger de sync nem de version', limiteSemSync.total === 0);
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
