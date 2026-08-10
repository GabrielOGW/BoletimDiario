/**
 * Identidade.
 *
 * `users` existe aqui porque **toda** coluna de auditoria do domínio referencia
 * `users(id)` — sem ela não há FK possível. As demais tabelas de autenticação
 * (sessão, conta, verificação) entram com a Better Auth, na etapa da skill
 * `plataforma`, geradas pela CLI dela.
 *
 * A PK é `uuid`, e não texto: é o que mantém `created_by`/`updated_by` uniformes com
 * o resto do schema. A Better Auth precisa ser configurada para gerar UUID e para
 * mapear o modelo `user` nesta tabela — se ela for adicionada com o padrão dela, as
 * duas definições divergem e as FKs quebram.
 */

import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
