/**
 * Guardas de autorização — servidor.
 *
 * **Toda decisão de autorização acontece aqui.** O cliente aplica as mesmas regras, mas
 * só para não mostrar botão que não funciona; nunca como controle.
 *
 * A ordem das checagens é a de `docs/architecture/permissions.md §3`, e o passo 2 tem uma
 * sutileza que não é detalhe: **quem não é membro recebe "não encontrado", não "proibido"**.
 * Responder 403 confirmaria que a produção existe para quem só tem o id — e o `joinCode`
 * é curto e adivinhável.
 */

import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';

import type { Department, MemberRole } from '@/domain/platform/enums';
import { roleAtLeast } from '@/domain/platform/enums';
import { db } from '@/lib/db/client';
import { productionMemberDepartments, productionMembers } from '@/lib/db/schema';

import { requireUser, type SessionUser } from './session';

export class NotAMemberError extends Error {
  constructor() {
    super('Produção não encontrada');
    this.name = 'NotAMemberError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Você não tem permissão para isso') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export interface Membership {
  id: string;
  productionId: string;
  user: SessionUser;
  role: MemberRole;
  /** Departamento principal + adicionais. A checagem sempre considera o conjunto. */
  departments: Department[];
}

/**
 * Sessão válida + pertencimento + papel mínimo.
 *
 * Membro com `deleted_at` preenchido foi removido da produção: não é membro.
 */
export async function requireMember(
  productionId: string,
  options: { minRole?: MemberRole } = {},
): Promise<Membership> {
  const user = await requireUser();

  const [row] = await db
    .select({
      id: productionMembers.id,
      role: productionMembers.role,
      department: productionMembers.department,
    })
    .from(productionMembers)
    .where(
      and(
        eq(productionMembers.productionId, productionId),
        eq(productionMembers.userId, user.id),
        isNull(productionMembers.deletedAt),
      ),
    )
    .limit(1);

  if (!row) throw new NotAMemberError();

  if (options.minRole && !roleAtLeast(row.role, options.minRole)) {
    throw new ForbiddenError();
  }

  const extras = await db
    .select({ department: productionMemberDepartments.department })
    .from(productionMemberDepartments)
    .where(eq(productionMemberDepartments.memberId, row.id));

  const departments = [row.department, ...extras.map((e) => e.department)];

  return {
    id: row.id,
    productionId,
    user,
    role: row.role,
    departments: [...new Set(departments)],
  };
}

/**
 * Permissão de escrita nos dados de um departamento.
 *
 * `ADMIN` e `OWNER` escrevem em qualquer departamento — na prática é quem corrige o
 * boletim quando alguém foi embora com o dado pela metade.
 *
 * Repare no que este guarda **não** faz: restringir leitura. Ler é sempre livre para
 * qualquer membro, e isso é o produto — a razão de a plataforma existir é a continuísta
 * ver a lente que a câmera usou.
 */
export async function requireDepartment(
  productionId: string,
  department: Department,
): Promise<Membership> {
  const membership = await requireMember(productionId, { minRole: 'MEMBER' });

  if (roleAtLeast(membership.role, 'ADMIN')) return membership;

  if (!membership.departments.includes(department)) {
    throw new ForbiddenError(`Você não faz parte do departamento ${department}`);
  }

  return membership;
}
