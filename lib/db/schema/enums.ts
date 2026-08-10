/**
 * Enums nativos do Postgres.
 *
 * Espelham 1:1 as listas de `domain/platform/enums.ts` — que é a fonte de verdade
 * do domínio. Se as duas divergirem, o domínio está certo e este arquivo está errado.
 * Os departamentos ainda sem UI já entram no enum: acrescentar valor depois custa uma
 * migration, e deixá-los prontos custa nada.
 */

import { pgEnum } from 'drizzle-orm/pg-core';

import {
  DAY_NIGHT_VALUES,
  DEPARTMENTS,
  EQUIPMENT_CATEGORIES,
  INT_EXT_VALUES,
  MEMBER_ROLES,
  SYNC_OPERATIONS,
  TAKE_STATUSES,
} from '@/domain/platform/enums';

export const departmentEnum = pgEnum('department', DEPARTMENTS);
export const memberRoleEnum = pgEnum('member_role', MEMBER_ROLES);
export const takeStatusEnum = pgEnum('take_status', TAKE_STATUSES);
export const equipmentCategoryEnum = pgEnum('equipment_category', EQUIPMENT_CATEGORIES);
export const intExtEnum = pgEnum('int_ext', INT_EXT_VALUES);
export const dayNightEnum = pgEnum('day_night', DAY_NIGHT_VALUES);
export const syncOpEnum = pgEnum('sync_op', SYNC_OPERATIONS);
