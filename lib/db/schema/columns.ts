/**
 * Colunas comuns a toda tabela de domínio.
 *
 * São funções, não objetos: cada tabela precisa das próprias instâncias de builder.
 * Compartilhar a mesma instância entre tabelas é a receita de um bug silencioso de
 * schema.
 */

import { integer, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './auth';

/**
 * Auditoria mínima + concorrência (ADR-013 da rodada 2, §9 do risks-response):
 * responde "quem alterou isso e quando", e nada além disso. Não existe histórico
 * campo a campo — `sync_log` cobre o resto.
 *
 * `deletedAt` é soft delete (ADR-015): delete físico não tem como ser propagado por
 * um sync baseado em cursor — o registro simplesmente some e os outros dispositivos
 * nunca ficam sabendo. Toda query de leitura precisa filtrar `deleted_at is null`.
 *
 * `version` é incrementado por trigger a cada UPDATE. Ele **não** é o mecanismo de
 * detecção de conflito (isso é o compare-and-set por campo, ADR-018); serve para
 * depuração e para o cliente reconhecer o eco do próprio push.
 */
export const audit = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: uuid('deleted_by').references(() => users.id),
  version: integer('version').notNull().default(1),
});
