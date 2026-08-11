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

/**
 * As regras de sala que o guarda não consegue expressar.
 *
 * `requireMember(minRole)` responde "este papel é alto o suficiente?", e isso não basta
 * aqui: as regras que faltam são *relacionais* — dependem do papel do alvo, não só do
 * papel de quem age (permissions.md §1, notas ¹ e ²). Elas vivem junto da escrita, e não
 * na tela, porque tela não é controle de acesso.
 */
export type MemberActionResult =
  | { status: 'OK' }
  | { status: 'NOT_FOUND' }
  | { status: 'FORBIDDEN'; reason: string };

async function loadMember(productionId: string, memberId: string) {
  const [row] = await db
    .select({ id: productionMembers.id, role: productionMembers.role })
    .from(productionMembers)
    .where(
      and(
        eq(productionMembers.id, memberId),
        eq(productionMembers.productionId, productionId),
        isNull(productionMembers.deletedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

/** Papel, departamento e função de um membro. Só `OWNER` mexe na linha do `OWNER`. */
export async function updateMember(input: {
  productionId: string;
  memberId: string;
  role: MemberRole;
  department: Department;
  jobTitle?: string;
  actor: { role: MemberRole; userId: string };
}): Promise<MemberActionResult> {
  const target = await loadMember(input.productionId, input.memberId);
  if (!target) return { status: 'NOT_FOUND' };

  if (target.role === 'OWNER' && input.actor.role !== 'OWNER') {
    return { status: 'FORBIDDEN', reason: 'Só o dono pode alterar o próprio papel.' };
  }

  // Promover a OWNER é transferência de posse, e transferência é um caminho só: o que
  // garante que a produção nunca fique com dois donos (nem com nenhum).
  if (input.role === 'OWNER' && target.role !== 'OWNER') {
    return {
      status: 'FORBIDDEN',
      reason: 'Para tornar alguém dono, use transferir posse.',
    };
  }

  await db
    .update(productionMembers)
    .set({
      role: input.role,
      department: input.department,
      jobTitle: input.jobTitle ?? null,
      updatedBy: input.actor.userId,
    })
    .where(eq(productionMembers.id, input.memberId));

  return { status: 'OK' };
}

/**
 * Remove um membro (soft delete — ADR-015).
 *
 * O `OWNER` não é removível por ninguém, nem por ele mesmo: uma produção sem dono não
 * tem quem a administre nem quem a exclua.
 */
export async function removeMember(input: {
  productionId: string;
  memberId: string;
  actor: { role: MemberRole; userId: string };
}): Promise<MemberActionResult> {
  const target = await loadMember(input.productionId, input.memberId);
  if (!target) return { status: 'NOT_FOUND' };

  if (target.role === 'OWNER') {
    return {
      status: 'FORBIDDEN',
      reason: 'O dono precisa transferir a posse antes de sair da produção.',
    };
  }

  if (target.role === 'ADMIN' && input.actor.role !== 'OWNER') {
    return { status: 'FORBIDDEN', reason: 'Só o dono pode remover um administrador.' };
  }

  await db
    .update(productionMembers)
    .set({ deletedAt: new Date(), deletedBy: input.actor.userId })
    .where(eq(productionMembers.id, input.memberId));

  return { status: 'OK' };
}

/**
 * Sair da produção. Qualquer papel pode, **menos** o `OWNER` — ele transfere antes.
 *
 * Não reaproveita `removeMember`: lá a pergunta é "posso mexer em outra pessoa?", aqui
 * não há outra pessoa. Só a trava do dono é comum às duas.
 */
export async function leaveProduction(input: {
  productionId: string;
  memberId: string;
  role: MemberRole;
  userId: string;
}): Promise<MemberActionResult> {
  if (input.role === 'OWNER') {
    return {
      status: 'FORBIDDEN',
      reason: 'Transfira a posse para outro membro antes de sair.',
    };
  }

  await db
    .update(productionMembers)
    .set({ deletedAt: new Date(), deletedBy: input.userId })
    .where(
      and(
        eq(productionMembers.id, input.memberId),
        eq(productionMembers.productionId, input.productionId),
      ),
    );

  return { status: 'OK' };
}

/**
 * Transfere a posse. O dono anterior vira `ADMIN` — perder o acesso à própria produção
 * ao passar o bastão seria uma armadilha.
 *
 * `db.batch` pelo mesmo motivo de `createProduction`: as duas escritas são independentes
 * e precisam ser atômicas. Se só uma passasse, a sala ficaria com dois donos ou nenhum.
 */
export async function transferOwnership(input: {
  productionId: string;
  fromMemberId: string;
  toMemberId: string;
  userId: string;
}): Promise<MemberActionResult> {
  if (input.fromMemberId === input.toMemberId) return { status: 'OK' };

  const target = await loadMember(input.productionId, input.toMemberId);
  if (!target) return { status: 'NOT_FOUND' };

  await db.batch([
    db
      .update(productionMembers)
      .set({ role: 'OWNER', updatedBy: input.userId })
      .where(eq(productionMembers.id, input.toMemberId)),
    db
      .update(productionMembers)
      .set({ role: 'ADMIN', updatedBy: input.userId })
      .where(eq(productionMembers.id, input.fromMemberId)),
  ]);

  return { status: 'OK' };
}
