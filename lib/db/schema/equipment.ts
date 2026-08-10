/**
 * Equipamento da produção e o que está em uso em cada diária.
 *
 * Definido antes dos módulos de departamento porque `camera_units` e
 * `sound_take_tracks` referenciam `equipment`.
 */

import { pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { audit } from './columns';
import { departmentEnum, equipmentCategoryEnum } from './enums';
import { productionMembers, productions, shootingDays } from './production';

export const equipment = pgTable('equipment', {
  id: uuid('id').primaryKey(),
  productionId: uuid('production_id')
    .notNull()
    .references(() => productions.id, { onDelete: 'cascade' }),
  department: departmentEnum('department').notNull(),
  category: equipmentCategoryEnum('category').notNull(),
  manufacturer: text('manufacturer'),
  model: text('model'),
  serialNumber: text('serial_number'),
  nickname: text('nickname'),
  notes: text('notes'),
  ...audit(),
});

/** Responde "o que estamos usando hoje?" entre departamentos. */
export const equipmentAssignments = pgTable('equipment_assignments', {
  id: uuid('id').primaryKey(),
  productionId: uuid('production_id')
    .notNull()
    .references(() => productions.id, { onDelete: 'cascade' }),
  equipmentId: uuid('equipment_id')
    .notNull()
    .references(() => equipment.id, { onDelete: 'cascade' }),
  shootingDayId: uuid('shooting_day_id').references(() => shootingDays.id, {
    onDelete: 'cascade',
  }),
  memberId: uuid('member_id').references(() => productionMembers.id),
  department: departmentEnum('department').notNull(),
  /** "Boom principal", "A CAM body". */
  label: text('label'),
  notes: text('notes'),
  ...audit(),
});
