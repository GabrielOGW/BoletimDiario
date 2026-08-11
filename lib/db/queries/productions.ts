/**
 * Queries de produção e entrada na sala.
 *
 * Sala não é tabela (ADR-001): entrar, sair e listar membros são operações sobre
 * `production_members`.
 */

import 'server-only';

import { and, desc, eq, isNull } from 'drizzle-orm';

import type { Department } from '@/domain/platform/enums';
import { deriveJoinCode } from '@/domain/platform/derive-id';
import { db } from '@/lib/db/client';
import { productionMembers, productions } from '@/lib/db/schema';
import { uid } from '@/utils/id';

export interface ProductionSummary {
  id: string;
  name: string;
  company: string | null;
  joinCode: string;
  joinEnabled: boolean;
  role: (typeof productionMembers.$inferSelect)['role'];
  department: Department;
}

export interface ProductionDetail {
  id: string;
  name: string;
  company: string | null;
  director: string | null;
  dop: string | null;
  joinCode: string;
  joinEnabled: boolean;
}

/**
 * Dados da sala.
 *
 * Não checa pertencimento de propósito: quem chama já passou por `requireMember`, e
 * duplicar a checagem aqui daria a falsa impressão de que ela é opcional lá.
 */
export async function getProduction(
  productionId: string,
): Promise<ProductionDetail | null> {
  const [row] = await db
    .select({
      id: productions.id,
      name: productions.name,
      company: productions.company,
      director: productions.director,
      dop: productions.dop,
      joinCode: productions.joinCode,
      joinEnabled: productions.joinEnabled,
    })
    .from(productions)
    .where(and(eq(productions.id, productionId), isNull(productions.deletedAt)))
    .limit(1);

  return row ?? null;
}

/** Produções de que o usuário participa, mais recentes primeiro. */
export async function listProductionsForUser(
  userId: string,
): Promise<ProductionSummary[]> {
  return db
    .select({
      id: productions.id,
      name: productions.name,
      company: productions.company,
      joinCode: productions.joinCode,
      joinEnabled: productions.joinEnabled,
      role: productionMembers.role,
      department: productionMembers.department,
    })
    .from(productionMembers)
    .innerJoin(productions, eq(productions.id, productionMembers.productionId))
    .where(
      and(
        eq(productionMembers.userId, userId),
        isNull(productionMembers.deletedAt),
        isNull(productions.deletedAt),
      ),
    )
    .orderBy(desc(productions.createdAt));
}

/**
 * Cria a produção e o vínculo do criador como `OWNER`, atomicamente.
 *
 * Se as duas escritas não forem atômicas, uma falha no meio deixa uma produção **sem
 * dono** — invisível para quem a criou e impossível de administrar.
 *
 * Usa `db.batch`, não `db.transaction`: o driver HTTP do Neon **não tem transação
 * interativa** (`db.transaction` lança). O batch é enviado numa requisição só e executa
 * dentro de uma transação no servidor, que é exatamente a garantia necessária aqui —
 * as duas inserções são independentes e nenhuma precisa do resultado da outra.
 */
export async function createProduction(input: {
  name: string;
  company?: string;
  director?: string;
  dop?: string;
  department: Department;
  userId: string;
  userName: string;
}): Promise<{ id: string; joinCode: string }> {
  const productionId = uid();
  const joinCode = await allocateJoinCode(input.name);

  await db.batch([
    db.insert(productions).values({
      id: productionId,
      name: input.name,
      company: input.company ?? null,
      director: input.director ?? null,
      dop: input.dop ?? null,
      joinCode,
      createdBy: input.userId,
      updatedBy: input.userId,
    }),
    db.insert(productionMembers).values({
      id: uid(),
      productionId,
      userId: input.userId,
      role: 'OWNER',
      department: input.department,
      displayName: input.userName,
      createdBy: input.userId,
      updatedBy: input.userId,
    }),
  ]);

  return { id: productionId, joinCode };
}

/**
 * Sorteia um código livre.
 *
 * `deriveJoinCode` é determinístico por construção (a migração precisa disso), então a
 * aleatoriedade vem da chave: um uuid novo a cada tentativa. Poucas tentativas bastam —
 * são 32⁴ sufixos por prefixo —, mas desistir com erro é melhor que entrar em laço
 * infinito se algo estiver muito errado.
 */
async function allocateJoinCode(name: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = deriveJoinCode(name, uid());
    const [taken] = await db
      .select({ id: productions.id })
      .from(productions)
      .where(eq(productions.joinCode, candidate))
      .limit(1);

    if (!taken) return candidate;
  }

  throw new Error('Não foi possível gerar um código de convite livre.');
}

/** Novo código; o anterior deixa de valer no mesmo instante. */
export async function rotateJoinCode(input: {
  productionId: string;
  name: string;
  userId: string;
}): Promise<string> {
  const joinCode = await allocateJoinCode(input.name);

  await db
    .update(productions)
    .set({ joinCode, updatedBy: input.userId })
    .where(eq(productions.id, input.productionId));

  return joinCode;
}

/** Fecha ou reabre a sala sem trocar o código de quem já o tem anotado. */
export async function setJoinEnabled(input: {
  productionId: string;
  enabled: boolean;
  userId: string;
}): Promise<void> {
  await db
    .update(productions)
    .set({ joinEnabled: input.enabled, updatedBy: input.userId })
    .where(eq(productions.id, input.productionId));
}

export type JoinResult =
  | { status: 'JOINED'; productionId: string }
  | { status: 'ALREADY_MEMBER'; productionId: string }
  | { status: 'NOT_FOUND' }
  | { status: 'CLOSED' };

/**
 * Entrada por código.
 *
 * Quem entra por código entra como `MEMBER`, sempre — o código identifica a produção,
 * nunca concede papel elevado.
 *
 * Reentrar depois de ter sido removido reativa o vínculo em vez de criar um segundo:
 * `unique (production_id, user_id)` não permitiria o segundo, e um erro de constraint na
 * cara de quem está tentando entrar seria um bug bobo e visível.
 */
export async function joinProductionByCode(input: {
  joinCode: string;
  department: Department;
  jobTitle?: string;
  userId: string;
  userName: string;
}): Promise<JoinResult> {
  const [production] = await db
    .select({ id: productions.id, joinEnabled: productions.joinEnabled })
    .from(productions)
    .where(and(eq(productions.joinCode, input.joinCode), isNull(productions.deletedAt)))
    .limit(1);

  if (!production) return { status: 'NOT_FOUND' };
  if (!production.joinEnabled) return { status: 'CLOSED' };

  const [existing] = await db
    .select({ id: productionMembers.id, deletedAt: productionMembers.deletedAt })
    .from(productionMembers)
    .where(
      and(
        eq(productionMembers.productionId, production.id),
        eq(productionMembers.userId, input.userId),
      ),
    )
    .limit(1);

  if (existing && !existing.deletedAt) {
    return { status: 'ALREADY_MEMBER', productionId: production.id };
  }

  if (existing) {
    await db
      .update(productionMembers)
      .set({
        deletedAt: null,
        deletedBy: null,
        department: input.department,
        jobTitle: input.jobTitle ?? null,
        updatedBy: input.userId,
      })
      .where(eq(productionMembers.id, existing.id));

    return { status: 'JOINED', productionId: production.id };
  }

  await db.insert(productionMembers).values({
    id: uid(),
    productionId: production.id,
    userId: input.userId,
    role: 'MEMBER',
    department: input.department,
    displayName: input.userName,
    jobTitle: input.jobTitle ?? null,
    createdBy: input.userId,
    updatedBy: input.userId,
  });

  return { status: 'JOINED', productionId: production.id };
}
