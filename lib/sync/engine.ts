'use client';

/**
 * O motor de sincronização: push, pull, cursor, conflito e cadência.
 *
 * É a única parte do cliente que fala com o servidor. Os módulos de departamento e as
 * telas de diária conhecem apenas `lib/offline/repos/*` — se aparecer um `fetch` lá, a
 * fronteira foi rompida (ADR-016).
 *
 * Três independências valem mais que qualquer otimização aqui:
 * push falhar não impede editar, pull falhar não impede editar, e **nada** disso é
 * requisito para preencher a diária já fixada.
 */

import {
  SYNC_PROTOCOL,
  type PullResponse,
  type PushResponse,
  type SnapshotResponse,
  type SyncEntityType,
} from '@/lib/contracts/sync';
import {
  cursorKey,
  getDb,
  getMeta,
  setMeta,
  type LocalRecord,
  type OutboxEntry,
  type SyncConflict,
} from '@/lib/offline/db';
import { backoffMs, nextBatch, pendingCount } from '@/lib/offline/outbox';
import { pinShootingDay } from '@/lib/offline/repos/diaria';
import { uid } from '@/utils/id';

// ---- Estado visível ----

export type ServerState = 'UNKNOWN' | 'REACHABLE' | 'UNREACHABLE';
export type SyncState = 'IDLE' | 'SYNCING' | 'ERROR' | 'OUTDATED';

export interface SyncSnapshot {
  server: ServerState;
  sync: SyncState;
  pending: number;
  conflicts: number;
  lastSyncAt: string | null;
  /** Preenchido quando o servidor recusou o protocolo — o sync trava, a edição não. */
  message: string | null;
}

let snapshot: SyncSnapshot = {
  server: 'UNKNOWN',
  sync: 'IDLE',
  pending: 0,
  conflicts: 0,
  lastSyncAt: null,
  message: null,
};

const listeners = new Set<() => void>();

export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** `useSyncExternalStore` compara por identidade: o objeto só muda quando algo mudou. */
export function getSyncSnapshot(): SyncSnapshot {
  return snapshot;
}

function update(patch: Partial<SyncSnapshot>): void {
  const proximo = { ...snapshot, ...patch };
  const igual = (Object.keys(proximo) as (keyof SyncSnapshot)[]).every(
    (key) => proximo[key] === snapshot[key],
  );
  if (igual) return;

  snapshot = proximo;
  for (const listener of listeners) listener();
}

/**
 * `UNREACHABLE` só depois de **duas** falhas seguidas.
 *
 * `navigator.onLine` é gatilho, nunca verdade: Teradek e captive portal de locação
 * reportam "online" sem internet. A verdade é o resultado da última requisição — e uma
 * falha isolada é comum demais para virar aviso.
 */
let falhasSeguidas = 0;

function registraFalha(): void {
  falhasSeguidas += 1;
  if (falhasSeguidas >= 2) update({ server: 'UNREACHABLE' });
}

function registraSucesso(): void {
  falhasSeguidas = 0;
  update({ server: 'REACHABLE', lastSyncAt: new Date().toISOString() });
}

async function atualizaContadores(productionId: string): Promise<void> {
  const [pending, conflicts] = await Promise.all([
    pendingCount(productionId),
    getDb()
      .syncConflicts.where('[productionId+status]')
      .equals([productionId, 'PENDING'])
      .count(),
  ]);
  update({ pending, conflicts });
}

// ---- Fixação ----

/** Baixa a diária para o banco local. É a única requisição obrigatória da fronteira. */
export async function fetchAndPin(shootingDayId: string): Promise<void> {
  const response = await fetch(
    `/api/sync/snapshot?protocol=${SYNC_PROTOCOL}&shootingDayId=${shootingDayId}`,
    { cache: 'no-store' },
  );

  if (response.status === 426) {
    update({ sync: 'OUTDATED', message: 'Atualize o app para continuar sincronizando.' });
    throw new Error('Protocolo incompatível.');
  }
  if (!response.ok) {
    registraFalha();
    throw new Error('Não foi possível baixar a diária.');
  }

  const snapshotDoDia = (await response.json()) as SnapshotResponse;
  await pinShootingDay(snapshotDoDia);
  registraSucesso();
}

// ---- Push ----

/**
 * Envia o próximo lote da produção.
 *
 * Sai em ordem de criação porque `CREATE setup` precisa chegar antes do `CREATE take`
 * que o referencia. Produções diferentes poderiam ir em paralelo; a mesma, nunca.
 */
export async function push(productionId: string): Promise<void> {
  const db = getDb();
  const lote = await nextBatch(productionId);
  if (lote.length === 0) return;

  update({ sync: 'SYNCING' });
  await db.outbox.bulkPut(
    lote.map((entry) => ({ ...entry, status: 'SYNCING' as const })),
  );

  let response: Response;
  try {
    response = await fetch('/api/sync/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        protocol: SYNC_PROTOCOL,
        productionId,
        operations: lote.map((entry) => ({
          id: entry.id,
          entityType: entry.entityType,
          entityId: entry.entityId,
          operation: entry.operation,
          fields: entry.fields,
          createdAt: entry.createdAt,
        })),
      }),
    });
  } catch {
    await devolveParaFila(lote);
    registraFalha();
    update({ sync: 'IDLE' });
    await atualizaContadores(productionId);
    return;
  }

  if (response.status === 426) {
    await devolveParaFila(lote, { semTentativa: true });
    update({ sync: 'OUTDATED', message: 'Atualize o app para continuar sincronizando.' });
    return;
  }

  // 401/403/404: a operação não vai passar tentando de novo. Vira FAILED com motivo —
  // e o payload continua na fila, visível e exportável.
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    const motivo =
      response.status === 401
        ? 'Sessão expirada. Entre novamente para sincronizar.'
        : 'Sem permissão para escrever nesta produção.';
    await db.outbox.bulkPut(
      lote.map((entry) => ({ ...entry, status: 'FAILED' as const, error: motivo })),
    );
    update({ sync: 'ERROR', message: motivo });
    await atualizaContadores(productionId);
    return;
  }

  if (!response.ok) {
    await devolveParaFila(lote);
    registraFalha();
    update({ sync: 'IDLE' });
    await atualizaContadores(productionId);
    return;
  }

  const { results } = (await response.json()) as PushResponse;
  const porId = new Map(lote.map((entry) => [entry.id, entry]));

  for (const result of results) {
    const entry = porId.get(result.id);
    if (!entry) continue;

    if (result.status === 'FAILED') {
      await db.outbox.put({ ...entry, status: 'FAILED', error: result.reason });
      continue;
    }

    if (result.conflicts.length > 0) {
      await registraConflitos(entry, result.conflicts);
    }

    await db.outbox.delete(entry.id);
    await limpaSujeira(entry.entityType, entry.entityId);
  }

  registraSucesso();
  update({ sync: 'IDLE', message: null });
  await atualizaContadores(productionId);
}

async function devolveParaFila(
  lote: OutboxEntry[],
  options: { semTentativa?: boolean } = {},
): Promise<void> {
  const db = getDb();
  await db.outbox.bulkPut(
    lote.map((entry) => {
      const attempts = options.semTentativa ? entry.attempts : entry.attempts + 1;
      return {
        ...entry,
        status: 'PENDING' as const,
        attempts,
        retryAfter: options.semTentativa ? undefined : Date.now() + backoffMs(attempts),
      };
    }),
  );
}

/**
 * O registro local **converge para o servidor** e o valor do usuário vira pendência
 * (ADR-020).
 *
 * Não é resolução automática por "quem escreveu por último": em set, o último a
 * sincronizar é frequentemente quem estava com o pior sinal, não quem tem a informação
 * certa. Por isso o valor do usuário não é descartado — vira uma decisão de um toque.
 */
async function registraConflitos(
  entry: OutboxEntry,
  conflicts: {
    field: string;
    atual: unknown;
    atualPor: string | null;
    atualEm: string | null;
  }[],
): Promise<void> {
  const db = getDb();
  const agora = new Date().toISOString();

  const registros: SyncConflict[] = conflicts.map((conflict) => ({
    id: uid(),
    productionId: entry.productionId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    field: conflict.field,
    meuValor: entry.fields[conflict.field]?.para ?? null,
    valorRemoto: conflict.atual,
    remotoPor: conflict.atualPor,
    remotoEm: conflict.atualEm,
    detectadoEm: agora,
    status: 'PENDING',
  }));

  await db.syncConflicts.bulkAdd(registros);

  const table = tabela(entry.entityType);
  const local = await table.get(entry.entityId);
  if (!local) return;

  const convergido = { ...local } as Record<string, unknown>;
  for (const conflict of conflicts) convergido[conflict.field] = conflict.atual;
  await table.put(convergido as LocalRecord & Record<string, unknown>);
}

function tabela(entityType: SyncEntityType) {
  const db = getDb();
  const tables = { scene: db.scenes, setup: db.setups, take: db.takes } as const;
  return tables[entityType] as unknown as {
    get: (id: string) => Promise<(LocalRecord & Record<string, unknown>) | undefined>;
    put: (row: LocalRecord & Record<string, unknown>) => Promise<string>;
  };
}

/** `_dirty` só cai quando a entidade não tem mais nada na fila. */
async function limpaSujeira(entityType: SyncEntityType, entityId: string): Promise<void> {
  const db = getDb();
  const restantes = await db.outbox
    .where('[entityType+entityId]')
    .equals([entityType, entityId])
    .count();

  if (restantes > 0) return;

  const table = tabela(entityType);
  const local = await table.get(entityId);
  if (local) await table.put({ ...local, _dirty: 0 });
}

// ---- Pull ----

/**
 * Traz o que mudou desde o cursor e aplica localmente.
 *
 * O cursor só avança **depois** de aplicar: interrupção no meio reprocessa o lote, e
 * reprocessar é inofensivo porque a aplicação é idempotente por `(entityId, version)`.
 */
export async function pull(productionId: string): Promise<void> {
  const db = getDb();
  const since = await getMeta<number>(cursorKey(productionId), 0);

  let response: Response;
  try {
    response = await fetch(
      `/api/sync/pull?protocol=${SYNC_PROTOCOL}&productionId=${productionId}&since=${since}`,
      { cache: 'no-store' },
    );
  } catch {
    registraFalha();
    return;
  }

  if (response.status === 426) {
    update({ sync: 'OUTDATED', message: 'Atualize o app para continuar sincronizando.' });
    return;
  }
  if (!response.ok) {
    registraFalha();
    return;
  }

  const { changes, cursor, hasMore } = (await response.json()) as PullResponse;

  for (const change of changes) {
    if (!change.data) continue;

    const table = tabela(change.entityType);
    const local = await table.get(change.entityId);

    // Eco do próprio push: mesma versão, nada a fazer.
    if (local && Number(local.version) >= change.version && !local._dirty) continue;

    const pendentes = await db.outbox
      .where('[entityType+entityId]')
      .equals([change.entityType, change.entityId])
      .filter((entry) => entry.status === 'PENDING' || entry.status === 'SYNCING')
      .toArray();

    // Campo com operação na fila não é sobrescrito: o que o usuário digitou e ainda não
    // saiu do aparelho é mais recente que o que veio do servidor.
    const protegidos = new Set(pendentes.flatMap((entry) => Object.keys(entry.fields)));

    const proximo: Record<string, unknown> = {
      ...(local ?? {}),
      ...Object.fromEntries(
        Object.entries(change.data).filter(([field]) => !protegidos.has(field)),
      ),
      id: change.entityId,
      productionId,
      version: change.version,
      _dirty: protegidos.size > 0 ? 1 : 0,
    };

    if (proximo.durationSec != null) proximo.durationSec = Number(proximo.durationSec);
    if (proximo.sortOrder != null) proximo.sortOrder = Number(proximo.sortOrder);
    if (proximo.number != null && change.entityType === 'take') {
      proximo.number = Number(proximo.number);
    }

    await table.put(proximo as LocalRecord & Record<string, unknown>);
  }

  await setMeta(cursorKey(productionId), cursor);
  registraSucesso();
  await atualizaContadores(productionId);

  if (hasMore) await pull(productionId);
}

// ---- Resolução de conflito ----

/**
 * `MEU` reenfileira `{ de: valorRemoto, para: meuValor }` — compare-and-set de novo, sem
 * caminho de código especial. `REMOTO` não escreve nada: o local já convergiu quando o
 * conflito foi detectado.
 */
export async function resolveConflict(
  conflictId: string,
  escolha: 'MEU' | 'REMOTO',
): Promise<void> {
  const db = getDb();
  const conflict = await db.syncConflicts.get(conflictId);
  if (!conflict || conflict.status === 'RESOLVED') return;

  if (escolha === 'MEU') {
    const { patchEntity } = await import('@/lib/offline/repos/diaria');
    await patchEntity(conflict.entityType, conflict.entityId, {
      [conflict.field]: conflict.meuValor,
    });
  }

  await db.syncConflicts.put({
    ...conflict,
    status: 'RESOLVED',
    resolucao: escolha,
    resolvidoEm: new Date().toISOString(),
  });

  await atualizaContadores(conflict.productionId);
}

// ---- Cadência ----

export type Activity = 'DIARIA' | 'PRODUCAO';

let timer: ReturnType<typeof setTimeout> | null = null;
let ativo: { productionId: string; activity: Activity } | null = null;
let ultimaMudanca = 0;

/** Marca atividade recente — é o que separa "10 s" de "30 s". */
export function markActivity(): void {
  ultimaMudanca = Date.now();
}

/**
 * Cadência adaptativa (ADR-021), e a linha mais importante é a última: **com a aba
 * oculta não faz nada**. É o que impede a conta de crescer com o aparelho no bolso.
 */
function intervalo(): number {
  if (!ativo) return 60_000;
  if (ativo.activity !== 'DIARIA') return 60_000;
  return Date.now() - ultimaMudanca < 2 * 60_000 ? 10_000 : 30_000;
}

async function ciclo(): Promise<void> {
  if (!ativo) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  if (snapshot.sync === 'OUTDATED') return;

  await push(ativo.productionId);
  await pull(ativo.productionId);
}

function agenda(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    await ciclo();
    agenda();
  }, intervalo());
}

/**
 * Liga o motor para uma produção. Devolve a função de desligar.
 *
 * Os gatilhos imediatos — voltar a ficar visível e o evento `online` — existem porque o
 * caso real é o aparelho sair do bolso já dentro do sinal: esperar o próximo tique seria
 * mostrar dado velho por meio minuto sem motivo.
 */
export function startSync(
  productionId: string,
  activity: Activity = 'DIARIA',
): () => void {
  ativo = { productionId, activity };
  markActivity();

  const acorda = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    void ciclo();
  };

  window.addEventListener('online', acorda);
  document.addEventListener('visibilitychange', acorda);

  void atualizaContadores(productionId);
  void ciclo();
  agenda();

  return () => {
    ativo = null;
    if (timer) clearTimeout(timer);
    timer = null;
    window.removeEventListener('online', acorda);
    document.removeEventListener('visibilitychange', acorda);
  };
}

/** Empurra agora — chamado depois de cada escrita, quando já se está online. */
export function syncNow(): void {
  markActivity();
  void ciclo();
}
