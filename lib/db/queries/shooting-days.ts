/**
 * Queries de diária.
 *
 * A diária é criada **fora** da fronteira offline (ADR-016): é preparação, feita sentado
 * e com sinal. O que acontece dentro dela — cena, setup, take — é que vive no banco local.
 */

import 'server-only';

import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import { deriveId } from '@/domain/platform/derive-id';
import { db } from '@/lib/db/client';
import { shootingDays } from '@/lib/db/schema';
import type { ShootingDayInput } from '@/lib/contracts';

export interface ShootingDayRow {
  id: string;
  date: string;
  dayNumber: string | null;
  unit: string | null;
  location: string | null;
  callTime: string | null;
  wrapTime: string | null;
  lunchStart: string | null;
  lunchEnd: string | null;
  notes: string | null;
}

const COLUMNS = {
  id: shootingDays.id,
  date: shootingDays.date,
  dayNumber: shootingDays.dayNumber,
  unit: shootingDays.unit,
  location: shootingDays.location,
  callTime: shootingDays.callTime,
  wrapTime: shootingDays.wrapTime,
  lunchStart: shootingDays.lunchStart,
  lunchEnd: shootingDays.lunchEnd,
  notes: shootingDays.notes,
};

/** Diárias da produção, da mais recente para a mais antiga — é como a equipe procura. */
export async function listShootingDays(productionId: string): Promise<ShootingDayRow[]> {
  return db
    .select(COLUMNS)
    .from(shootingDays)
    .where(
      and(eq(shootingDays.productionId, productionId), isNull(shootingDays.deletedAt)),
    )
    .orderBy(desc(shootingDays.date), asc(shootingDays.unit));
}

export async function getShootingDay(input: {
  productionId: string;
  dayId: string;
}): Promise<ShootingDayRow | null> {
  const [row] = await db
    .select(COLUMNS)
    .from(shootingDays)
    .where(
      and(
        eq(shootingDays.id, input.dayId),
        eq(shootingDays.productionId, input.productionId),
        isNull(shootingDays.deletedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

/**
 * Cria — ou reabre — a diária daquela data e unidade.
 *
 * O id é **derivado** da chave natural (ADR-019), e é isso que torna a operação
 * idempotente: dois toques no botão, ou uma criação repetida por outro membro, chegam ao
 * mesmo id em vez de duplicarem o dia. O `unique (production_id, date, unit)` não
 * bastaria — em Postgres, `null` é distinto de `null`, então duas diárias sem unidade
 * passariam pela constraint.
 */
export async function createShootingDay(input: {
  productionId: string;
  data: ShootingDayInput;
  userId: string;
}): Promise<string> {
  const id = deriveId(
    'shooting_day',
    input.productionId,
    input.data.date,
    input.data.unit ?? '',
  );

  await db
    .insert(shootingDays)
    .values({
      id,
      productionId: input.productionId,
      ...input.data,
      createdBy: input.userId,
      updatedBy: input.userId,
    })
    .onConflictDoUpdate({
      target: shootingDays.id,
      set: {
        ...input.data,
        deletedAt: null,
        deletedBy: null,
        updatedBy: input.userId,
      },
    });

  return id;
}

/**
 * Editar não re-deriva o id — derivação é garantia de convergência na criação, não uma
 * invariante do registro. Mudar a data para a de outra diária existente é recusado pelo
 * `unique (production_id, date, unit)`, que é onde essa regra tem que morar.
 */
export async function updateShootingDay(input: {
  productionId: string;
  dayId: string;
  data: ShootingDayInput;
  userId: string;
}): Promise<void> {
  await db
    .update(shootingDays)
    .set({ ...input.data, updatedBy: input.userId })
    .where(
      and(
        eq(shootingDays.id, input.dayId),
        eq(shootingDays.productionId, input.productionId),
      ),
    );
}

export async function deleteShootingDay(input: {
  productionId: string;
  dayId: string;
  userId: string;
}): Promise<void> {
  await db
    .update(shootingDays)
    .set({ deletedAt: new Date(), deletedBy: input.userId })
    .where(
      and(
        eq(shootingDays.id, input.dayId),
        eq(shootingDays.productionId, input.productionId),
      ),
    );
}
