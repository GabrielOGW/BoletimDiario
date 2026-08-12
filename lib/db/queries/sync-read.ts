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

  const cameraUnits = await db.execute<Record<string, unknown>>(sql`
    select ${entitySelect('cameraUnit')} from camera_units
     where production_id = ${input.productionId} and deleted_at is null
  `);

  const cameraTakeData = await db.execute<Record<string, unknown>>(sql`
    select ${entitySelect('cameraTakeData')} from camera_take_data
     where production_id = ${input.productionId}
       and take_id in (
         select t.id from takes t
           join setups s on s.id = t.setup_id
          where s.production_id = ${input.productionId}
            and s.shooting_day_id = ${input.shootingDayId}
       )
  `);

  /**
   * A configuração de som é **da diária**, não da produção: uma linha, e ela é o primeiro
   * registro que o som toca no dia. Vem no snapshot para que tocar nele não peça sinal.
   */
  const soundDayConfig = await db.execute<Record<string, unknown>>(sql`
    select ${entitySelect('soundDayConfig')} from sound_day_config
     where production_id = ${input.productionId}
       and shooting_day_id = ${input.shootingDayId}
  `);

  const soundTakeData = await db.execute<Record<string, unknown>>(sql`
    select ${entitySelect('soundTakeData')} from sound_take_data
     where production_id = ${input.productionId}
       and take_id in (${takesDaDiaria(input)})
  `);

  const soundTakeTracks = await db.execute<Record<string, unknown>>(sql`
    select ${entitySelect('soundTakeTrack')} from sound_take_tracks
     where production_id = ${input.productionId}
       and take_id in (${takesDaDiaria(input)})
  `);

  const continuityTakeData = await db.execute<Record<string, unknown>>(sql`
    select ${entitySelect('continuityTakeData')} from continuity_take_data
     where production_id = ${input.productionId}
       and take_id in (${takesDaDiaria(input)})
  `);

  /**
   * As quatro coleções de estado vêm por **cena da produção**, não só pelas cenas do dia.
   *
   * É a diferença entre ter e não ter continuidade: o valor delas é atravessar dias — "no
   * take de ontem o copo estava pela metade, e hoje vamos rodar o contracampo". Recortar
   * pela diária entregaria uma continuísta sem a memória do que ela mesma anotou.
   *
   * São linhas de texto e o volume acompanha o número de cenas, não o de takes. Se um dia
   * uma produção grande mostrar que isso pesa, o corte natural é por cena **tocada** na
   * diária — mas cortar antes de doer seria trocar a função do módulo por um byte.
   */
  const escopoDaProducao = sql`
    scene_id in (select id from scenes where production_id = ${input.productionId})
    or setup_id in (${setupsDaDiaria(input)})
    or take_id in (${takesDaDiaria(input)})
  `;

  const continuityProps = await db.execute<Record<string, unknown>>(sql`
    select ${entitySelect('continuityProp')} from continuity_props
     where production_id = ${input.productionId} and (${escopoDaProducao})
  `);

  const continuityWardrobe = await db.execute<Record<string, unknown>>(sql`
    select ${entitySelect('continuityWardrobe')} from continuity_wardrobe
     where production_id = ${input.productionId} and (${escopoDaProducao})
  `);

  const continuityHairMakeup = await db.execute<Record<string, unknown>>(sql`
    select ${entitySelect('continuityHairMakeup')} from continuity_hair_makeup
     where production_id = ${input.productionId} and (${escopoDaProducao})
  `);

  const continuitySetDressing = await db.execute<Record<string, unknown>>(sql`
    select ${entitySelect('continuitySetDressing')} from continuity_set_dressing
     where production_id = ${input.productionId} and (${escopoDaProducao})
  `);

  /** O balanço do dia é fechado no wrap, na locação: vem no snapshot para não pedir rede. */
  const dailyProgressReport = await db.execute<Record<string, unknown>>(sql`
    select ${entitySelect('dailyProgressReport')} from daily_progress_report
     where production_id = ${input.productionId}
       and shooting_day_id = ${input.shootingDayId}
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
    cameraUnits: cameraUnits.rows,
    cameraTakeData: cameraTakeData.rows,
    soundDayConfig: soundDayConfig.rows,
    soundTakeData: soundTakeData.rows,
    soundTakeTracks: soundTakeTracks.rows,
    continuityTakeData: continuityTakeData.rows,
    continuityProps: continuityProps.rows,
    continuityWardrobe: continuityWardrobe.rows,
    continuityHairMakeup: continuityHairMakeup.rows,
    continuitySetDressing: continuitySetDressing.rows,
    dailyProgressReport: dailyProgressReport.rows,
    members: members.rows,
  };
}

/** Os setups da diária, como subconsulta — o par de `takesDaDiaria`. */
function setupsDaDiaria(input: { productionId: string; shootingDayId: string }) {
  return sql`
    select id from setups
     where production_id = ${input.productionId}
       and shooting_day_id = ${input.shootingDayId}
  `;
}

/**
 * Os takes da diária, como subconsulta.
 *
 * Escrita uma vez porque três departamentos fazem o mesmo recorte, e três cópias da mesma
 * junção é onde uma delas um dia esquece o `production_id` — que é o eixo de toda
 * autorização.
 */
function takesDaDiaria(input: { productionId: string; shootingDayId: string }) {
  return sql`
    select t.id from takes t
      join setups s on s.id = t.setup_id
     where s.production_id = ${input.productionId}
       and s.shooting_day_id = ${input.shootingDayId}
  `;
}
