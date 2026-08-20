/**
 * "Qual é a minha diária de hoje?" — a consulta que o caminho curto precisa (Fase 11).
 *
 * Fora da fronteira offline (ADR-016), como todo o resto da sala: ela responde na **hora
 * de chegar**, quando ainda há sinal. O caminho que precisa funcionar sem rede é o outro,
 * o "continuar de onde parei", que é local e não pergunta nada a ninguém.
 */

import 'server-only';

import { and, asc, eq, isNull } from 'drizzle-orm';

import type { Department } from '@/domain/platform/enums';
import { db } from '@/lib/db/client';
import { productionMembers, productions, shootingDays } from '@/lib/db/schema';

export interface DiariaDoDia {
  productionId: string;
  producao: string;
  shootingDayId: string;
  date: string;
  dayNumber: string | null;
  location: string | null;
  /** O departamento **deste** membro nesta produção — é o que escolhe a tela. */
  department: Department;
}

/**
 * As diárias daquele dia civil nas produções de que a pessoa participa.
 *
 * A data vem de fora, e isso é a decisão que importa: quem sabe que dia é hoje é o
 * aparelho na locação, não o servidor (R9 — a diária é dia civil e nunca vira UTC). Às
 * 21h de Brasília o `current_date` do banco já é o dia seguinte, e o atalho levaria para
 * uma diária que ainda não aconteceu.
 *
 * Devolve **lista**, e não a primeira: quem está em duas produções no mesmo dia precisa
 * escolher, e escolher errado por conta do app é pior do que escolher na mão.
 */
export async function diariasNaData(input: {
  userId: string;
  date: string;
}): Promise<DiariaDoDia[]> {
  return db
    .select({
      productionId: productions.id,
      producao: productions.name,
      shootingDayId: shootingDays.id,
      date: shootingDays.date,
      dayNumber: shootingDays.dayNumber,
      location: shootingDays.location,
      department: productionMembers.department,
    })
    .from(productionMembers)
    .innerJoin(productions, eq(productions.id, productionMembers.productionId))
    .innerJoin(shootingDays, eq(shootingDays.productionId, productions.id))
    .where(
      and(
        eq(productionMembers.userId, input.userId),
        isNull(productionMembers.deletedAt),
        isNull(productions.deletedAt),
        isNull(shootingDays.deletedAt),
        eq(shootingDays.date, input.date),
      ),
    )
    .orderBy(asc(productions.name));
}

/**
 * Hoje e amanhã, para a fixação automática.
 *
 * Amanhã entra porque a diária de amanhã costuma começar antes de haver sinal: quem sai
 * de casa às 5h para uma locação sem cobertura precisa que o dia já esteja no aparelho —
 * era a pendência declarada da Fase 4.
 */
export async function diariasParaFixar(input: {
  userId: string;
  hoje: string;
  amanha: string;
}): Promise<DiariaDoDia[]> {
  const [deHoje, deAmanha] = await Promise.all([
    diariasNaData({ userId: input.userId, date: input.hoje }),
    diariasNaData({ userId: input.userId, date: input.amanha }),
  ]);

  return [...deHoje, ...deAmanha];
}
