/**
 * O lado de leitura do sync: pull incremental e snapshot de fixação.
 *
 * Separado do push porque a natureza é outra — aqui não há decisão nenhuma, só projeção
 * do estado atual. Todo o cuidado do compare-and-set mora em `sync.ts`.
 */

import 'server-only';

import { sql } from 'drizzle-orm';

import {
  ENTITY_BY_TABLE,
  SYNC_ENTITIES,
  type FieldKind,
  type PullChange,
  type SnapshotResponse,
  type SyncEntityType,
  toColumn,
} from '@/lib/contracts/sync';
import { db } from '@/lib/db/client';

/** Colunas comuns a toda entidade sincronizável, além dos campos do registro. */
const FIXED_COLUMNS = ['id', 'production_id', 'version', 'updated_at', 'updated_by'];

/** `production_id` → `productionId`. O inverso de `toColumn`. */
function camel(column: string): string {
  return column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * A projeção de uma entidade, já em camelCase e com instante em ISO-8601.
 *
 * Explícita em vez de `select *`: o cliente recebe exatamente os campos do registro de
 * sincronização, e uma coluna nova no banco não vaza para o Dexie sem alguém decidir.
 */
function entitySelect(entityType: SyncEntityType) {
  const entity = SYNC_ENTITIES[entityType];
  const kinds = entity.fields as Record<string, FieldKind>;

  const columns = [
    ...FIXED_COLUMNS.map(
      (column) =>
        sql`${sql.identifier(column)}::text as ${sql.identifier(camel(column))}`,
    ),
    ...Object.keys(kinds).map((field) => {
      const column = toColumn(field);
      const expression =
        kinds[field] === 'instant'
          ? sql`to_char(${sql.identifier(column)} at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
          : sql`${sql.identifier(column)}::text`;
      return sql`${expression} as ${sql.identifier(field)}`;
    }),
  ];

  return sql.join(columns, sql`, `);
}

/**
 * Pull incremental pelo cursor do `sync_log` (ADR-006).
 *
 * O log diz **o que** mudou; o estado vem da tabela. Guardar o payload no log seria mais
 * rápido e teria como divergir do registro real — que é o defeito que não se percebe até
 * um dispositivo mostrar um valor que não existe mais.
 *
 * Entidade que este protocolo não conhece é ignorada, e o cursor avança do mesmo jeito:
 * senão a escrita de um departamento ainda não implementado travaria o cursor para todos.
 */
export async function pullChanges(input: {
  productionId: string;
  since: number;
  limit: number;
}): Promise<{ changes: PullChange[]; cursor: number; hasMore: boolean }> {
  const log = await db.execute<{
    seq: string;
    entity_type: string;
    entity_id: string;
    operation: 'CREATE' | 'UPDATE' | 'DELETE';
    version: number;
  }>(sql`
    select seq::text as seq, entity_type, entity_id::text as entity_id, operation, version
      from sync_log
     where production_id = ${input.productionId} and seq > ${input.since}
     order by seq
     limit ${input.limit + 1}
  `);

  const hasMore = log.rows.length > input.limit;
  const rows = hasMore ? log.rows.slice(0, input.limit) : log.rows;

  if (rows.length === 0) {
    return { changes: [], cursor: input.since, hasMore: false };
  }

  const porTipo = new Map<SyncEntityType, Set<string>>();
  for (const row of rows) {
    const type = ENTITY_BY_TABLE[row.entity_type];
    if (!type) continue;
    if (!porTipo.has(type)) porTipo.set(type, new Set());
    porTipo.get(type)?.add(row.entity_id);
  }

  const dados = new Map<string, Record<string, unknown>>();
  for (const [type, ids] of porTipo) {
    const encontrados = await db.execute<Record<string, unknown>>(sql`
      select ${entitySelect(type)}
        from ${sql.identifier(SYNC_ENTITIES[type].table)}
       where production_id = ${input.productionId}
         and id in (${sql.join(
           [...ids].map((id) => sql`${id}`),
           sql`, `,
         )})
    `);
    for (const row of encontrados.rows) {
      dados.set(`${type}:${String(row.id)}`, row);
    }
  }

  const changes: PullChange[] = [];
  for (const row of rows) {
    const type = ENTITY_BY_TABLE[row.entity_type];
    if (!type) continue;

    changes.push({
      entityType: type,
      entityId: row.entity_id,
      operation: row.operation,
      version: Number(row.version),
      seq: Number(row.seq),
      data: dados.get(`${type}:${row.entity_id}`) ?? null,
    });
  }

  return { changes, cursor: Number(rows[rows.length - 1].seq), hasMore };
}

/**
 * Snapshot de fixação: tudo que a diária precisa para abrir sem rede.
 *
 * Traz **todas** as cenas da produção, não só as do dia: escolher a cena de um setup novo
 * é preenchimento, e preenchimento não pode depender de rede (ADR-016). São poucos
 * registros de texto — o custo é irrelevante perto de travar em locação.
 */
export async function loadSnapshot(input: {
  productionId: string;
  shootingDayId: string;
}): Promise<Omit<SnapshotResponse, 'protocol' | 'productionId'> | null> {
  const dia = await db.execute<Record<string, unknown>>(sql`
    select id::text as id, date::text as date, day_number as "dayNumber", unit,
           location, call_time::text as "callTime", wrap_time::text as "wrapTime",
           notes, version
      from shooting_days
     where id = ${input.shootingDayId} and production_id = ${input.productionId}
       and deleted_at is null
     limit 1
  `);

  const shootingDay = dia.rows[0];
  if (!shootingDay) return null;

  const scenes = await db.execute<Record<string, unknown>>(sql`
    select ${entitySelect('scene')} from scenes
     where production_id = ${input.productionId} and deleted_at is null
  `);

  const setups = await db.execute<Record<string, unknown>>(sql`
    select ${entitySelect('setup')} from setups
     where production_id = ${input.productionId}
       and shooting_day_id = ${input.shootingDayId}
  `);

  const takes = await db.execute<Record<string, unknown>>(sql`
    select ${entitySelect('take')} from takes
     where production_id = ${input.productionId}
       and setup_id in (
         select id from setups
          where production_id = ${input.productionId}
            and shooting_day_id = ${input.shootingDayId}
       )
  `);

  const members = await db.execute<{
    id: string;
    userId: string;
    name: string;
    department: string;
  }>(sql`
    select m.id::text as id, m.user_id::text as "userId",
           coalesce(nullif(m.display_name, ''), u.name) as name, m.department
      from production_members m
      join users u on u.id = m.user_id
     where m.production_id = ${input.productionId} and m.deleted_at is null
  `);

  const cursor = await db.execute<{ seq: string | null }>(sql`
    select max(seq)::text as seq from sync_log
     where production_id = ${input.productionId}
  `);

  return {
    cursor: Number(cursor.rows[0]?.seq ?? 0),
    shootingDay,
    scenes: scenes.rows,
    setups: setups.rows,
    takes: takes.rows,
    members: members.rows,
  };
}
