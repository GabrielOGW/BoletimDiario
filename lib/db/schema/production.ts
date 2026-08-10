/**
 * Produção, membros e diárias.
 *
 * A **sala não é uma tabela** (ADR-001): é a projeção colaborativa de uma
 * `Production`. Por isso `join_code` e `join_enabled` moram aqui.
 */

import {
  boolean,
  date,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './auth';
import { audit } from './columns';
import { departmentEnum, memberRoleEnum } from './enums';

export const productions = pgTable('productions', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  company: text('company'),
  director: text('director'),
  dop: text('dop'),
  /** "FILMEX-8K2P" — código curto de convite, rotacionável. */
  joinCode: text('join_code').notNull().unique(),
  /** Fecha a sala sem precisar trocar o código. */
  joinEnabled: boolean('join_enabled').notNull().default(true),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  ...audit(),
});

export const productionMembers = pgTable(
  'production_members',
  {
    id: uuid('id').primaryKey(),
    productionId: uuid('production_id')
      .notNull()
      .references(() => productions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Papel na sala. Independente do departamento — ver permissions.md. */
    role: memberRoleEnum('role').notNull().default('MEMBER'),
    department: departmentEnum('department').notNull(),
    displayName: text('display_name'),
    jobTitle: text('job_title'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    /** Presença no dashboard. Atualizado no próprio pull, sem canal separado. */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    ...audit(),
  },
  (t) => [unique('production_members_production_user').on(t.productionId, t.userId)],
);

/** Departamentos adicionais de um mesmo membro (raro, mas real: DIT que também é 2º AC). */
export const productionMemberDepartments = pgTable(
  'production_member_departments',
  {
    memberId: uuid('member_id')
      .notNull()
      .references(() => productionMembers.id, { onDelete: 'cascade' }),
    department: departmentEnum('department').notNull(),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.department] })],
);

export const shootingDays = pgTable(
  'shooting_days',
  {
    id: uuid('id').primaryKey(),
    productionId: uuid('production_id')
      .notNull()
      .references(() => productions.id, { onDelete: 'cascade' }),
    /**
     * `date`, não `timestamptz`: a diária é um **dia civil**, não um instante (R9).
     * Nunca convertida para UTC — e, como entra na derivação do id da diária,
     * tratá-la como instante duplicaria diárias para quem cruza fuso.
     */
    date: date('date', { mode: 'string' }).notNull(),
    /** Texto porque existe "12A", "12B". */
    dayNumber: text('day_number'),
    unit: text('unit'),
    location: text('location'),
    callTime: time('call_time'),
    wrapTime: time('wrap_time'),
    lunchStart: time('lunch_start'),
    lunchEnd: time('lunch_end'),
    notes: text('notes'),
    ...audit(),
  },
  (t) => [
    unique('shooting_days_production_date_unit').on(t.productionId, t.date, t.unit),
  ],
);
