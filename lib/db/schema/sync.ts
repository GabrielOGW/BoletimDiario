/**
 * Log de sincronização — o cursor do pull incremental.
 *
 * Escrito por trigger em todas as tabelas de domínio.
 *
 * **Por que `bigserial` e não `updated_at`** (ADR-006): relógio de cliente não é
 * confiável e o do servidor pode empatar em milissegundos. Com `timestamptz` como
 * cursor, duas escritas no mesmo milissegundo fazem a segunda ser silenciosamente
 * perdida **para sempre**. Um `bigserial` do próprio banco elimina a classe de falha.
 *
 * **O que este log NÃO guarda:** a lista de chaves alteradas em cada operação. A versão
 * anterior do desenho precisava disso para detectar sobreposição de campos; com o delta
 * `{ de, para }` do ADR-018 o servidor compara direto com o valor atual, e o log volta
 * a ser só cursor.
 */

import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './auth';
import { syncOpEnum } from './enums';
import { productions } from './production';

export const syncLog = pgTable(
  'sync_log',
  {
    seq: bigserial('seq', { mode: 'number' }).primaryKey(),
    productionId: uuid('production_id')
      .notNull()
      .references(() => productions.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    operation: syncOpEnum('operation').notNull(),
    version: integer('version').notNull(),
    actorId: uuid('actor_id').references(() => users.id),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sync_log_production_seq').on(t.productionId, t.seq)],
);

/**
 * Operações de push já aplicadas — a chave de idempotência do protocolo.
 *
 * O `id` da operação é gerado pelo cliente e reenviar depois de um timeout é o caminho
 * **normal** numa rede de set, não a exceção. Sem esta tabela, uma resposta perdida no
 * caminho de volta viraria take duplicado ou campo aplicado duas vezes.
 *
 * O resultado fica guardado junto: um reenvio precisa devolver a **mesma** resposta que
 * o original, inclusive os conflitos. Recalcular daria outra coisa — na segunda vez o
 * valor já está aplicado, e o cliente veria "sem conflito" onde houve um.
 *
 * Não tem `deleted_at` nem `version`: não é entidade de domínio, não sincroniza, e o
 * trigger de `sync_log` não a alcança.
 */
export const syncOperations = pgTable(
  'sync_operations',
  {
    id: uuid('id').primaryKey(),
    productionId: uuid('production_id')
      .notNull()
      .references(() => productions.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    actorId: uuid('actor_id').references(() => users.id),
    result: jsonb('result').notNull(),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sync_operations_production').on(t.productionId, t.appliedAt)],
);
