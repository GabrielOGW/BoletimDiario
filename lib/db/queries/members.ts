/**
 * Queries de membros da sala.
 */

import 'server-only';

import { and, asc, eq, isNull } from 'drizzle-orm';

import type { Department, MemberRole } from '@/domain/platform/enums';
import { db } from '@/lib/db/client';
import { productionMembers, users } from '@/lib/db/schema';

export interface MemberRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  department: Department;
  jobTitle: string | null;
  lastSeenAt: Date | null;
}

/**
 * Membros ativos de uma produção.
 *
 * `displayName` tem precedência sobre o nome da conta: em set, a pessoa é conhecida pelo
 * nome que assina o boletim, que nem sempre é o nome do cadastro.
 */
export async function listMembers(productionId: string): Promise<MemberRow[]> {
  const rows = await db
    .select({
      id: productionMembers.id,
      userId: productionMembers.userId,
      displayName: productionMembers.displayName,
      accountName: users.name,
      email: users.email,
      role: productionMembers.role,
      department: productionMembers.department,
      jobTitle: productionMembers.jobTitle,
      lastSeenAt: productionMembers.lastSeenAt,
    })
    .from(productionMembers)
    .innerJoin(users, eq(users.id, productionMembers.userId))
    .where(
      and(
        eq(productionMembers.productionId, productionId),
        isNull(productionMembers.deletedAt),
      ),
    )
    .orderBy(asc(productionMembers.joinedAt));

  return rows.map(({ displayName, accountName, ...rest }) => ({
    ...rest,
    name: displayName?.trim() || accountName,
  }));
}

/** Marca presença. Chamado no pull — presença não tem canal próprio (ADR-021). */
export async function touchPresence(memberId: string): Promise<void> {
  await db
    .update(productionMembers)
    .set({ lastSeenAt: new Date() })
    .where(eq(productionMembers.id, memberId));
}
