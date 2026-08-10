'use client';

/**
 * Repositório da superfície de diária — **a única camada que toca no Dexie**.
 *
 * Mesmo papel de `lib/storage.ts` no boletim de câmera: nenhum componente chama
 * `db.takes.put()` direto. E nenhuma função daqui faz `fetch` — dentro da fronteira, o
 * servidor não existe; quem fala com ele é `lib/sync` (ADR-016).
 *
 * Toda escrita é uma transação que faz **as duas coisas juntas**: estado local e
 * intenção de sincronizar.
 */

import type { Table } from 'dexie';

import { deriveId } from '@/domain/platform/derive-id';
import {
  SYNC_ENTITIES,
  type FieldKind,
  type SnapshotResponse,
  type SyncEntityType,
  sameValue,
} from '@/lib/contracts/sync';
import {
  PINS_KEY,
  cursorKey,
  getDb,
  getMeta,
  setMeta,
  type LocalRecord,
  type LocalScene,
  type LocalSetup,
  type LocalShootingDay,
  type LocalTake,
} from '../db';
import { enqueue, type Delta } from '../outbox';

type AnyRecord = LocalRecord & Record<string, unknown>;

function tableOf(entityType: SyncEntityType): Table<AnyRecord, string> {
  const db = getDb();
  const tables = {
    scene: db.scenes,
    setup: db.setups,
    take: db.takes,
  } as const;
  return tables[entityType] as unknown as Table<AnyRecord, string>;
}

// ---- Fixação (pin) ----

/**
 * Grava o snapshot e fixa a diária.
 *
 * Tudo numa transação só: uma fixação pela metade — cenas sim, takes não — seria pior
 * que nenhuma, porque a tela abriria mostrando um dia incompleto como se fosse o dia.
 *
 * O que já está sujo localmente **não é sobrescrito**: quem fixou de novo enquanto tinha
 * pendência na fila não pode perder o que digitou.
 */
export async function pinShootingDay(snapshot: SnapshotResponse): Promise<void> {
  const db = getDb();

  await db.transaction(
    'rw',
    [db.shootingDays, db.scenes, db.setups, db.takes, db.refs, db.meta],
    async () => {
      await db.shootingDays.put(
        toLocal(
          snapshot.shootingDay,
          snapshot.productionId,
        ) as unknown as LocalShootingDay,
      );

      await mergeRemote(
        db.scenes as unknown as Table<AnyRecord, string>,
        snapshot.scenes,
        snapshot.productionId,
      );
      await mergeRemote(
        db.setups as unknown as Table<AnyRecord, string>,
        snapshot.setups,
        snapshot.productionId,
      );
      await mergeRemote(
        db.takes as unknown as Table<AnyRecord, string>,
        snapshot.takes,
        snapshot.productionId,
      );

      await db.refs.put({
        key: `members:${snapshot.productionId}`,
        value: snapshot.members,
      });

      const pins = await getMeta<string[]>(PINS_KEY, []);
      if (!pins.includes(String(snapshot.shootingDay.id))) {
        await setMeta(PINS_KEY, [...pins, String(snapshot.shootingDay.id)]);
      }

      const atual = await getMeta<number>(cursorKey(snapshot.productionId), 0);
      if (snapshot.cursor > atual) {
        await setMeta(cursorKey(snapshot.productionId), snapshot.cursor);
      }
    },
  );
}

async function mergeRemote(
  table: Table<AnyRecord, string>,
  rows: Record<string, unknown>[],
  productionId: string,
): Promise<void> {
  for (const row of rows) {
    const local = await table.get(String(row.id));
    if (local?._dirty) continue;
    await table.put(toLocal(row, productionId));
  }
}

/** Linha do servidor → registro local. Os tipos vêm como texto e voltam a ser tipos. */
function toLocal(row: Record<string, unknown>, productionId: string): AnyRecord {
  return {
    ...row,
    id: String(row.id),
    productionId,
    version: Number(row.version ?? 0),
    sortOrder: row.sortOrder === undefined ? undefined : Number(row.sortOrder),
    number: row.number === undefined ? undefined : row.number,
    durationSec: row.durationSec == null ? null : Number(row.durationSec),
    _dirty: 0,
  } as AnyRecord;
}

export async function isPinned(shootingDayId: string): Promise<boolean> {
  const pins = await getMeta<string[]>(PINS_KEY, []);
  return pins.includes(shootingDayId);
}

/** Desfixar só é oferecido com a fila vazia — quem chama garante isso. */
export async function unpin(shootingDayId: string): Promise<void> {
  const pins = await getMeta<string[]>(PINS_KEY, []);
  await setMeta(
    PINS_KEY,
    pins.filter((id) => id !== shootingDayId),
  );
}

// ---- Escrita ----

/**
 * Cria um registro com id **derivado da chave natural** (ADR-019).
 *
 * É o que faz dois dispositivos offline criando "o take 4 do setup C" produzirem o mesmo
 * id e, portanto, o mesmo registro: a colisão vira convergência em vez de erro, e não
 * existe id temporário para remapear depois — a fonte clássica de referência quebrada.
 */
async function createEntity(
  entityType: SyncEntityType,
  id: string,
  record: AnyRecord,
): Promise<string> {
  const db = getDb();
  const table = tableOf(entityType);
  const kinds = SYNC_ENTITIES[entityType].fields as Record<string, FieldKind>;

  await db.transaction('rw', [table, db.outbox], async () => {
    const existente = await table.get(id);
    if (existente && !existente.deletedAt) return;

    await table.put({ ...record, id, version: 0, _dirty: 1 });

    const fields: Delta = {};
    for (const field of Object.keys(kinds)) {
      const value = record[field];
      if (value === undefined || value === null) continue;
      fields[field] = { de: null, para: value as unknown };
    }

    await enqueue({
      productionId: record.productionId,
      entityType,
      entityId: id,
      operation: 'CREATE',
      fields,
    });
  });

  return id;
}

export async function createScene(input: {
  productionId: string;
  number: string;
  block?: string | null;
  location?: string | null;
  description?: string | null;
}): Promise<string> {
  const id = deriveId('scene', input.productionId, input.number, input.block ?? '');
  return createEntity('scene', id, {
    ...input,
    block: input.block ?? null,
    id,
    version: 0,
    _dirty: 1,
  } as AnyRecord);
}

export async function createSetup(input: {
  productionId: string;
  sceneId: string;
  shootingDayId: string;
  code: string;
  name?: string | null;
  sortOrder?: number;
}): Promise<string> {
  const id = deriveId('setup', input.sceneId, input.shootingDayId, input.code);
  return createEntity('setup', id, {
    ...input,
    name: input.name ?? null,
    sortOrder: input.sortOrder ?? 0,
    id,
    version: 0,
    _dirty: 1,
  } as AnyRecord);
}

export async function createTake(input: {
  productionId: string;
  setupId: string;
  number: number;
  status?: string;
  notes?: string | null;
}): Promise<string> {
  const id = deriveId('take', input.setupId, String(input.number));
  return createEntity('take', id, {
    ...input,
    status: input.status ?? 'RECORDED',
    notes: input.notes ?? null,
    id,
    version: 0,
    _dirty: 1,
  } as AnyRecord);
}

/** Próximo número de take do setup — a numeração é por setup, não por cena. */
export async function nextTakeNumber(setupId: string): Promise<number> {
  const takes = await getDb().takes.where('setupId').equals(setupId).toArray();
  return takes.reduce((maior, take) => Math.max(maior, take.number), 0) + 1;
}

/**
 * Altera campos de um registro. Escrita local imediata, sem esperar rede.
 *
 * O delta sai daqui com os **dois** valores: o `de` é o que está gravado agora, que é
 * exatamente o que o servidor precisa para decidir campo a campo sem histórico.
 */
export async function patchEntity(
  entityType: SyncEntityType,
  id: string,
  changes: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  const table = tableOf(entityType);
  const kinds = SYNC_ENTITIES[entityType].fields as Record<string, FieldKind>;

  await db.transaction('rw', [table, db.outbox], async () => {
    const current = await table.get(id);
    if (!current) return;

    const fields: Delta = {};
    for (const [field, value] of Object.entries(changes)) {
      if (!(field in kinds)) continue;
      const antes = current[field] ?? null;
      if (sameValue(kinds[field], antes, value)) continue;
      fields[field] = { de: antes, para: value ?? null };
    }

    if (Object.keys(fields).length === 0) return;

    await table.put({ ...current, ...changes, _dirty: 1 });
    await enqueue({
      productionId: current.productionId,
      entityType,
      entityId: id,
      operation: 'UPDATE',
      fields,
    });
  });
}

/**
 * Exclusão é **um campo** (`deletedAt`) e passa pelo mesmo compare-and-set.
 *
 * É o que resolve o conflito edição×exclusão sem mecanismo novo: quem editou depois vê
 * "o outro apagou" como conflito de campo, com a opção de restaurar.
 */
export async function softDelete(entityType: SyncEntityType, id: string): Promise<void> {
  await patchEntity(entityType, id, { deletedAt: new Date().toISOString() });
}

export async function restore(entityType: SyncEntityType, id: string): Promise<void> {
  await patchEntity(entityType, id, { deletedAt: null });
}

// ---- Leitura ----

const vivo = <T extends LocalRecord>(row: T) => !row.deletedAt;

export async function listScenes(productionId: string): Promise<LocalScene[]> {
  const rows = await getDb().scenes.where('productionId').equals(productionId).toArray();
  return rows
    .filter(vivo)
    .sort((a, b) => a.number.localeCompare(b.number, 'pt-BR', { numeric: true }));
}

export async function listSetups(shootingDayId: string): Promise<LocalSetup[]> {
  const rows = await getDb()
    .setups.where('shootingDayId')
    .equals(shootingDayId)
    .toArray();
  return rows
    .filter(vivo)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}

export async function listTakes(setupIds: string[]): Promise<LocalTake[]> {
  if (setupIds.length === 0) return [];
  const rows = await getDb().takes.where('setupId').anyOf(setupIds).toArray();
  return rows.filter(vivo).sort((a, b) => a.number - b.number);
}

export async function getShootingDay(id: string): Promise<LocalShootingDay | undefined> {
  return getDb().shootingDays.get(id);
}
