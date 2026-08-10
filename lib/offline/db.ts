'use client';

/**
 * Banco local da superfície de diária (ADR-003, ADR-016).
 *
 * **Só o que está dentro da fronteira mora aqui.** Produção, membros, auth e relatórios
 * são Next.js comum lendo Drizzle no servidor — se algum dia aparecer uma tabela de
 * produção neste arquivo, a fronteira foi rompida.
 *
 * Dexie e não IndexedDB cru pelo que o IndexedDB cru não dá: upgrade versionado de
 * schema, transação declarativa e `liveQuery` — reatividade que já funciona entre abas.
 * Errar no banco local significa perder o boletim de um dia de filmagem, e isso não é
 * lugar para economizar.
 */

import Dexie, { type Table } from 'dexie';

import type { SyncEntityType } from '@/lib/contracts/sync';

/** O que toda entidade sincronizável carrega, além dos próprios campos. */
export interface LocalRecord {
  id: string;
  productionId: string;
  /** Versão do servidor. `0` enquanto o registro só existe aqui. */
  version: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
  deletedAt?: string | null;
  /** `1` quando há mudança local ainda não confirmada pelo servidor. */
  _dirty: 0 | 1;
}

export interface LocalShootingDay extends LocalRecord {
  date: string;
  dayNumber?: string | null;
  unit?: string | null;
  location?: string | null;
  callTime?: string | null;
  wrapTime?: string | null;
  notes?: string | null;
}

export interface LocalScene extends LocalRecord {
  number: string;
  block?: string | null;
  page?: string | null;
  storyDay?: string | null;
  intExt?: string | null;
  dayNight?: string | null;
  location?: string | null;
  description?: string | null;
}

export interface LocalSetup extends LocalRecord {
  sceneId: string;
  shootingDayId: string;
  code: string;
  name?: string | null;
  shotSize?: string | null;
  angle?: string | null;
  movement?: string | null;
  screenDirection?: string | null;
  eyeline?: string | null;
  description?: string | null;
  sortOrder: number;
}

export interface LocalTake extends LocalRecord {
  setupId: string;
  number: number;
  status: string;
  durationSec?: number | null;
  notes?: string | null;
}

export type OutboxStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';

export interface OutboxEntry {
  id: string;
  productionId: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  /** Delta com os dois valores — ADR-018. */
  fields: Record<string, { de: unknown; para: unknown }>;
  createdAt: string;
  attempts: number;
  status: OutboxStatus;
  /** Motivo do último erro. `FAILED` **nunca** descarta o payload. */
  error?: string;
  /** Momento (epoch ms) antes do qual não se tenta de novo — backoff com jitter. */
  retryAfter?: number;
}

export interface SyncConflict {
  id: string;
  productionId: string;
  entityType: SyncEntityType;
  entityId: string;
  field: string;
  meuValor: unknown;
  valorRemoto: unknown;
  remotoPor: string | null;
  remotoEm: string | null;
  detectadoEm: string;
  status: 'PENDING' | 'RESOLVED';
  resolucao?: 'MEU' | 'REMOTO';
  resolvidoEm?: string;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

/**
 * `refs` guarda o que vem do snapshot só para leitura — membros, hoje. Não sincroniza e
 * não entra na outbox: se estiver velho, o pior que acontece é um nome desatualizado ao
 * lado de um conflito.
 */
export interface RefEntry {
  key: string;
  value: unknown;
}

class PlatformDatabase extends Dexie {
  shootingDays!: Table<LocalShootingDay, string>;
  scenes!: Table<LocalScene, string>;
  setups!: Table<LocalSetup, string>;
  takes!: Table<LocalTake, string>;
  outbox!: Table<OutboxEntry, string>;
  syncConflicts!: Table<SyncConflict, string>;
  meta!: Table<MetaEntry, string>;
  refs!: Table<RefEntry, string>;

  constructor() {
    super('bdc-platform');

    this.version(1).stores({
      shootingDays: 'id, productionId, date',
      scenes: 'id, productionId, [number+block]',
      setups: 'id, productionId, sceneId, shootingDayId, [shootingDayId+sortOrder]',
      takes: 'id, productionId, setupId, [setupId+number]',
      outbox:
        'id, productionId, status, createdAt, [productionId+status], [entityType+entityId]',
      syncConflicts:
        'id, productionId, status, [entityType+entityId+field], [productionId+status]',
      meta: 'key',
      refs: 'key',
    });
  }
}

/**
 * Instância única, criada só no navegador.
 *
 * Módulo com `'use client'` ainda é importado durante o render de servidor; construir o
 * Dexie ali quebraria o build. O acesso é sempre por `getDb()`.
 */
let instance: PlatformDatabase | null = null;

export function getDb(): PlatformDatabase {
  if (typeof indexedDB === 'undefined') {
    throw new Error('O banco local só existe no navegador.');
  }
  instance ??= new PlatformDatabase();
  return instance;
}

// ---- meta ----

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await getDb().meta.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await getDb().meta.put({ key, value });
}

/** Cursor do pull, por produção. */
export const cursorKey = (productionId: string) => `cursor:${productionId}`;

/** Diárias fixadas. Fixar é o que autoriza a diária a existir sem rede. */
export const PINS_KEY = 'pins';
