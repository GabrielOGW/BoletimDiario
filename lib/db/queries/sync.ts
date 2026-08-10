/**
 * O núcleo do push: **compare-and-set por campo** (ADR-018).
 *
 * O cliente manda o delta com os dois valores — `{ campo: { de, para } }` — e o servidor
 * decide campo a campo, sem consultar histórico nenhum:
 *
 * | `atual` é…            | resultado                        |
 * | --------------------- | -------------------------------- |
 * | igual a `de`          | aplica `para`                    |
 * | igual a `para`        | ninguém mexeu de verdade; ignora |
 * | qualquer outra coisa  | conflito **só daquele campo**    |
 *
 * A consequência que importa em set: dois assistentes editando campos diferentes do
 * mesmo take fazem merge automático, sem diálogo no meio da filmagem. Só o mesmo campo
 * conflita, e o conflito é de um campo — nunca do registro.
 *
 * O driver HTTP do Neon não tem transação interativa, então o ciclo é
 * ler → comparar → escrever com **as condições reasseridas no `where`**. Se alguém
 * escreveu entre a leitura e a escrita, o `update` não casa, o laço relê e o campo vira
 * conflito. É otimista e é correto: não existe janela de escrita perdida.
 */

import 'server-only';

import { sql } from 'drizzle-orm';

import {
  SYNC_ENTITIES,
  type FieldConflict,
  type FieldKind,
  type OperationResult,
  type SyncOperationInput,
  normalizeValue,
  toColumn,
} from '@/lib/contracts/sync';
import { db } from '@/lib/db/client';

/**
 * Expressão SQL que traz o campo já como texto comparável.
 *
 * Instante vira milissegundos: o formato textual de `timestamptz` depende do `TimeZone`
 * e do `DateStyle` da sessão, e comparar strings assim daria conflito por causa de
 * configuração do banco.
 */
function comparableSql(kind: FieldKind, column: string) {
  if (kind === 'instant') {
    return sql`(extract(epoch from ${sql.identifier(column)}) * 1000)::bigint::text`;
  }
  return sql`${sql.identifier(column)}::text`;
}

/**
 * Texto vindo do `select` para a forma comparável.
 *
 * **Não** passa por `normalizeValue`: o SQL já entregou o instante em milissegundos, e
 * `normalizeValue` esperaria ISO-8601 ali. Misturar os dois fazia todo `deletedAt` do
 * banco virar `null` — e um conflito de exclusão passar despercebido como se ninguém
 * tivesse apagado nada.
 */
function fromDb(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  return String(raw);
}

/** Texto comparável de volta ao formato que o cliente entende. */
function fromComparable(kind: FieldKind, value: string | null): unknown {
  if (value === null) return null;
  if (kind === 'int') return Number(value);
  if (kind === 'instant') return new Date(Number(value)).toISOString();
  return value;
}

/** `''` é ausência de valor, não string vazia — a mesma regra dos formulários. */
function forWrite(kind: FieldKind, value: unknown): unknown {
  if (value === null || value === undefined || value === '') return null;
  if (kind === 'int') return Number(value);
  return value;
}

interface CurrentRow {
  values: Record<string, string | null>;
  updatedBy: string | null;
  updatedAt: string | null;
}

async function readCurrent(
  entityType: keyof typeof SYNC_ENTITIES,
  entityId: string,
  productionId: string,
  fields: string[],
): Promise<CurrentRow | null> {
  const entity = SYNC_ENTITIES[entityType];
  const kinds = entity.fields as Record<string, FieldKind>;

  const selected = fields.map(
    (field) =>
      sql`${comparableSql(kinds[field], toColumn(field))} as ${sql.identifier(`f_${toColumn(field)}`)}`,
  );

  const rows = await db.execute<Record<string, string | null>>(sql`
    select ${sql.join(selected, sql`, `)},
           updated_by::text as updated_by,
           updated_at::text as updated_at
      from ${sql.identifier(entity.table)}
     where id = ${entityId} and production_id = ${productionId}
     limit 1
  `);

  const row = rows.rows[0];
  if (!row) return null;

  const values: Record<string, string | null> = {};
  for (const field of fields) {
    values[field] = fromDb(row[`f_${toColumn(field)}`]);
  }

  return { values, updatedBy: row.updated_by, updatedAt: row.updated_at };
}

/**
 * Nome de quem escreveu por último — o conflito precisa dizer "João", não um uuid.
 *
 * É o autor do **registro**, não do campo: `updated_by` é uma coluna só. Guardar autoria
 * por campo dobraria a escrita para melhorar um rótulo, e o rótulo já acerta no caso
 * comum (quem conflitou com você quase sempre é quem mexeu no take por último).
 */
async function actorName(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const rows = await db.execute<{ name: string }>(
    sql`select name from users where id = ${userId} limit 1`,
  );
  return rows.rows[0]?.name ?? null;
}

/**
 * CREATE — `on conflict (id) do nothing`.
 *
 * Já existir **não é erro**: é o outro dispositivo tendo criado o mesmo take com o mesmo
 * id derivado (ADR-019). A colisão é convergência. Os campos seguem para o
 * compare-and-set normal logo depois, então nada do que o cliente mandou se perde.
 */
async function applyCreate(
  op: SyncOperationInput,
  productionId: string,
  actorId: string,
): Promise<void> {
  const entity = SYNC_ENTITIES[op.entityType];
  const kinds = entity.fields as Record<string, FieldKind>;
  const fields = Object.keys(op.fields).filter((field) => field in kinds);

  const columns = [
    sql.identifier('id'),
    sql.identifier('production_id'),
    sql.identifier('created_by'),
    sql.identifier('updated_by'),
    ...fields.map((field) => sql.identifier(toColumn(field))),
  ];

  const values = [
    sql`${op.entityId}`,
    sql`${productionId}`,
    sql`${actorId}`,
    sql`${actorId}`,
    ...fields.map((field) => sql`${forWrite(kinds[field], op.fields[field].para)}`),
  ];

  await db.execute(sql`
    insert into ${sql.identifier(entity.table)} (${sql.join(columns, sql`, `)})
    values (${sql.join(values, sql`, `)})
    on conflict (id) do nothing
  `);
}

/**
 * Uma operação, do começo ao fim.
 *
 * `DELETE` não tem caminho próprio: soft delete é o campo `deletedAt`, e passa pelo
 * mesmo compare-and-set. É o que resolve edição×exclusão sem mecanismo novo — quem
 * editou depois vê "o outro apagou" como conflito, com opção de restaurar.
 */
export async function applyOperation(
  op: SyncOperationInput,
  productionId: string,
  actorId: string,
): Promise<OperationResult> {
  const entity = SYNC_ENTITIES[op.entityType];
  const kinds = entity.fields as Record<string, FieldKind>;

  const desconhecidos = Object.keys(op.fields).filter((field) => !(field in kinds));
  if (desconhecidos.length > 0) {
    return {
      id: op.id,
      status: 'FAILED',
      applied: [],
      conflicts: [],
      reason: `Campo não sincronizável: ${desconhecidos.join(', ')}`,
    };
  }

  if (op.operation === 'CREATE') {
    await applyCreate(op, productionId, actorId);
  }

  const fields = Object.keys(op.fields);
  if (fields.length === 0) {
    return { id: op.id, status: 'APPLIED', applied: [], conflicts: [] };
  }

  // Duas voltas no máximo: a segunda cobre quem escreveu entre a leitura e a escrita.
  // Uma terceira não acrescentaria nada — na segunda o campo já vira conflito.
  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    const current = await readCurrent(op.entityType, op.entityId, productionId, fields);

    if (!current) {
      return {
        id: op.id,
        status: 'FAILED',
        applied: [],
        conflicts: [],
        reason: 'Registro não existe nesta produção.',
      };
    }

    const aplicar: string[] = [];
    const jaEstava: string[] = [];
    const conflitantes: string[] = [];

    for (const field of fields) {
      const kind = kinds[field];
      const atual = current.values[field];
      const de = normalizeValue(kind, op.fields[field].de);
      const para = normalizeValue(kind, op.fields[field].para);

      if (atual === de) aplicar.push(field);
      else if (atual === para) jaEstava.push(field);
      else conflitantes.push(field);
    }

    const conflicts: FieldConflict[] = [];
    if (conflitantes.length > 0) {
      const nome = await actorName(current.updatedBy);
      for (const field of conflitantes) {
        conflicts.push({
          field,
          atual: fromComparable(kinds[field], current.values[field]),
          atualPor: nome,
          atualEm: current.updatedAt,
        });
      }
    }

    const mudam = aplicar.filter(
      (field) =>
        normalizeValue(kinds[field], op.fields[field].de) !==
        normalizeValue(kinds[field], op.fields[field].para),
    );

    if (mudam.length === 0) {
      return {
        id: op.id,
        status:
          conflicts.length > 0
            ? jaEstava.length + aplicar.length > 0
              ? 'PARTIAL'
              : 'CONFLICT'
            : 'APPLIED',
        applied: [...aplicar, ...jaEstava],
        conflicts,
      };
    }

    const sets = mudam.map(
      (field) =>
        sql`${sql.identifier(toColumn(field))} = ${forWrite(kinds[field], op.fields[field].para)}`,
    );

    // As condições do `de` voltam no `where`: é isso que fecha a janela entre a leitura
    // e a escrita sem transação interativa.
    const guards = mudam.map(
      (field) =>
        sql`${comparableSql(kinds[field], toColumn(field))} is not distinct from ${normalizeValue(kinds[field], op.fields[field].de)}`,
    );

    const updated = await db.execute(sql`
      update ${sql.identifier(entity.table)}
         set ${sql.join([...sets, sql`updated_by = ${actorId}`], sql`, `)}
       where id = ${op.entityId}
         and production_id = ${productionId}
         and ${sql.join(guards, sql` and `)}
      returning version
    `);

    if (updated.rows.length > 0) {
      return {
        id: op.id,
        status: conflicts.length > 0 ? 'PARTIAL' : 'APPLIED',
        applied: [...aplicar, ...jaEstava],
        conflicts,
      };
    }
    // Alguém escreveu no meio: relê e reclassifica.
  }

  const current = await readCurrent(op.entityType, op.entityId, productionId, fields);
  const nome = await actorName(current?.updatedBy ?? null);

  return {
    id: op.id,
    status: 'CONFLICT',
    applied: [],
    conflicts: fields.map((field) => ({
      field,
      atual: fromComparable(kinds[field], current?.values[field] ?? null),
      atualPor: nome,
      atualEm: current?.updatedAt ?? null,
    })),
  };
}

/**
 * Um lote de operações, com idempotência.
 *
 * O `id` da operação é a chave: reenviar depois de um timeout devolve **a resposta
 * guardada**, não uma nova. Recalcular seria pior que não guardar nada — na segunda vez
 * o valor já estaria aplicado, e o cliente veria "sem conflito" onde houve um.
 *
 * Sequencial de propósito: `CREATE setup` precisa chegar antes do `CREATE take` que o
 * referencia, e a fila é FIFO por produção.
 */
export async function pushOperations(input: {
  productionId: string;
  actorId: string;
  operations: SyncOperationInput[];
}): Promise<OperationResult[]> {
  const ids = input.operations.map((op) => op.id);

  const conhecidas = await db.execute<{ id: string; result: OperationResult }>(sql`
    select id::text as id, result
      from sync_operations
     where production_id = ${input.productionId}
       and id in (${sql.join(
         ids.map((id) => sql`${id}`),
         sql`, `,
       )})
  `);

  const guardadas = new Map(conhecidas.rows.map((row) => [row.id, row.result]));
  const results: OperationResult[] = [];

  for (const op of input.operations) {
    const anterior = guardadas.get(op.id);
    if (anterior) {
      results.push(anterior);
      continue;
    }

    let result: OperationResult;
    try {
      result = await applyOperation(op, input.productionId, input.actorId);
    } catch (error) {
      // Falha de banco não derruba o lote: as outras operações seguem, e esta volta como
      // FAILED — com o payload intacto no cliente, que nunca o descarta.
      result = {
        id: op.id,
        status: 'FAILED',
        applied: [],
        conflicts: [],
        reason: error instanceof Error ? error.message : 'Erro ao aplicar a operação.',
      };
    }

    // Só o que foi decidido de verdade é memorizado. Gravar um FAILED transitório
    // tornaria o erro permanente: o reenvio devolveria o mesmo FAILED para sempre.
    if (result.status !== 'FAILED') {
      await db.execute(sql`
        insert into sync_operations
               (id, production_id, entity_type, entity_id, actor_id, result)
        values (${op.id}, ${input.productionId}, ${op.entityType}, ${op.entityId},
                ${input.actorId}, ${JSON.stringify(result)}::jsonb)
        on conflict (id) do nothing
      `);
    }

    results.push(result);
  }

  return results;
}
