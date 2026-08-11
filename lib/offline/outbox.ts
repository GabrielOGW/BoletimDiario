'use client';

/**
 * A fila de saída.
 *
 * A regra que sustenta tudo: **enfileirar acontece na mesma transação Dexie da escrita
 * local**. Se as duas não forem atômicas, existe uma janela em que o dado está salvo mas
 * nunca será sincronizado — e ninguém percebe até o fim da diária. Por isso nenhuma
 * função daqui abre transação própria: elas são chamadas de dentro da transação do
 * repositório.
 */

import {
  type SyncEntityType,
  sameValue,
  SYNC_ENTITIES,
  type FieldKind,
} from '@/lib/contracts/sync';
import { uid } from '@/utils/id';

import { getDb, type OutboxEntry } from './db';

export type Delta = Record<string, { de: unknown; para: unknown }>;

/**
 * Funde um delta novo no que já está esperando na fila.
 *
 * A regra inteira cabe numa linha e é a que importa: **o `de` original é preservado**, só
 * o destino muda. Substituí-lo faria a operação coalescida afirmar um estado inicial que
 * o servidor nunca viu — e o compare-and-set devolveria conflito com o próprio usuário.
 *
 * Pura de propósito: é a lógica que precisa de teste, e teste dela não deveria precisar
 * de IndexedDB.
 */
export function coalesceFields(anterior: Delta, novos: Delta): Delta {
  const fundido: Delta = { ...anterior };

  for (const [field, value] of Object.entries(novos)) {
    const existente = anterior[field];
    fundido[field] = existente ? { de: existente.de, para: value.para } : value;
  }

  return fundido;
}

/**
 * Enfileira uma operação, coalescendo com a que já estiver `PENDING`.
 *
 * A coalescência não é otimização: um campo digitado com debounce de 500 ms gera uma
 * dezena de operações, e sem preservar o `de` **original** a primeira venceria o
 * compare-and-set com um valor obsoleto e as seguintes virariam conflito com o próprio
 * usuário.
 *
 * Operação já em `SYNCING` não é tocada — ela está em voo, e mexer no payload depois de
 * enviado quebraria a idempotência.
 */
export async function enqueue(input: {
  productionId: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  fields: Delta;
}): Promise<void> {
  const db = getDb();
  const kinds = SYNC_ENTITIES[input.entityType].fields as Record<string, FieldKind>;

  // Campo cujo `de` e `para` são iguais não é mudança: enfileirá-lo geraria tráfego e
  // uma chance a mais de conflito espúrio.
  const fields: Delta = {};
  for (const [field, value] of Object.entries(input.fields)) {
    if (!(field in kinds)) continue;
    if (input.operation !== 'CREATE' && sameValue(kinds[field], value.de, value.para)) {
      continue;
    }
    fields[field] = value;
  }

  if (Object.keys(fields).length === 0 && input.operation !== 'CREATE') return;

  const pendente = await db.outbox
    .where('[entityType+entityId]')
    .equals([input.entityType, input.entityId])
    .filter((entry) => entry.status === 'PENDING')
    .first();

  if (pendente) {
    pendente.fields = coalesceFields(pendente.fields, fields);
    await db.outbox.put(pendente);
    return;
  }

  const entry: OutboxEntry = {
    id: uid(),
    productionId: input.productionId,
    entityType: input.entityType,
    entityId: input.entityId,
    operation: input.operation,
    fields,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: 'PENDING',
  };

  await db.outbox.add(entry);
}

/** Operações prontas para ir, em ordem de criação. FIFO por produção. */
export async function nextBatch(
  productionId: string,
  limit = 200,
): Promise<OutboxEntry[]> {
  const agora = Date.now();

  const pendentes = await getDb()
    .outbox.where('[productionId+status]')
    .equals([productionId, 'PENDING'])
    .toArray();

  return pendentes
    .filter((entry) => !entry.retryAfter || entry.retryAfter <= agora)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, limit);
}

/** Quantas operações ainda não saíram — o número que o indicador mostra. */
export async function pendingCount(productionId: string): Promise<number> {
  return getDb()
    .outbox.where('productionId')
    .equals(productionId)
    .filter((entry) => entry.status === 'PENDING' || entry.status === 'SYNCING')
    .count();
}

/**
 * Backoff exponencial com teto de 5 min **e jitter**.
 *
 * O jitter não é refinamento: a equipe inteira reconecta no mesmo instante quando o
 * Wi-Fi da base volta, e sem ele todos os aparelhos batem no servidor juntos, repetindo
 * a pancada a cada rodada.
 */
export function backoffMs(attempts: number): number {
  const base = Math.min(2000 * 2 ** Math.max(0, attempts - 1), 5 * 60 * 1000);
  return base / 2 + Math.random() * (base / 2);
}
