'use server';

/**
 * Server Actions da sala.
 *
 * Tudo aqui é **fora da fronteira offline** (ADR-016): nenhuma outbox, nenhum cursor,
 * nenhuma Dexie. São operações de preparação — feitas sentado, com sinal, antes de a
 * claquete bater — e podem exigir rede sem prejuízo nenhum.
 *
 * Toda ação segue a ordem obrigatória de `docs/architecture/permissions.md §3`: sessão →
 * pertencimento (404, não 403) → papel → payload. O guarda faz os três primeiros passos;
 * as regras relacionais que ele não expressa ("ADMIN não mexe no OWNER") ficam na camada
 * de query, junto da escrita.
 */

import { randomUUID } from 'node:crypto';

import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import {
  ForbiddenError,
  NotAMemberError,
  requireMember,
  type Membership,
} from '@/lib/auth/guards';
import {
  LIMITE_DE_ENTRADA,
  chaveDeEntrada,
  consomeTentativa,
  emLinguagemDeGente,
  esqueceTentativas,
} from '@/lib/auth/limite';
import { requireUser } from '@/lib/auth/session';
import {
  assignmentSchema,
  createProductionSchema,
  equipmentSchema,
  joinProductionSchema,
  shootingDaySchema,
  updateMemberSchema,
  uuidSchema,
} from '@/lib/contracts';
import {
  createProduction,
  joinProductionByCode,
  rotateJoinCode,
  setJoinEnabled,
  getProduction,
} from '@/lib/db/queries/productions';
import {
  leaveProduction,
  removeMember,
  transferOwnership,
  updateMember,
} from '@/lib/db/queries/members';
import {
  assignEquipment,
  createEquipment,
  deleteEquipment,
  listEquipment,
  unassignEquipment,
  updateEquipment,
} from '@/lib/db/queries/equipment';
import {
  createShootingDay,
  deleteShootingDay,
  updateShootingDay,
} from '@/lib/db/queries/shooting-days';

/** Estado devolvido a `useActionState`. Sucesso redireciona, então só o erro sobra. */
export interface ActionState {
  error?: string;
}

/**
 * Converte as falhas de autorização em resposta.
 *
 * `NotAMemberError` vira 404 de propósito: responder 403 confirmaria a existência da
 * produção para quem só tem o id. Qualquer outro erro é relançado — inclusive o
 * `NEXT_REDIRECT`, que é como o `redirect()` funciona.
 */
function falha(error: unknown): ActionState {
  if (error instanceof NotAMemberError) notFound();
  if (error instanceof ForbiddenError) return { error: error.message };
  throw error;
}

function texto(form: FormData, field: string): string {
  const value = form.get(field);
  return typeof value === 'string' ? value : '';
}

/** Primeiro erro do Zod, que é o que cabe numa faixa de erro de formulário. */
function primeiroErro(issues: { message: string }[]): string {
  return issues[0]?.message ?? 'Verifique os dados informados.';
}

// ---- Produções ----

export async function criarProducaoAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = createProductionSchema.safeParse({
    name: texto(form, 'name'),
    company: texto(form, 'company') || undefined,
    director: texto(form, 'director') || undefined,
    dop: texto(form, 'dop') || undefined,
    department: texto(form, 'department'),
  });

  if (!parsed.success) return { error: primeiroErro(parsed.error.issues) };

  const { id } = await createProduction({
    ...parsed.data,
    userId: user.id,
    userName: user.name,
  });

  revalidatePath('/producoes');
  redirect(`/p/${id}`);
}

export async function entrarPorCodigoAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = joinProductionSchema.safeParse({
    joinCode: texto(form, 'joinCode'),
    department: texto(form, 'department'),
    jobTitle: texto(form, 'jobTitle') || undefined,
  });

  if (!parsed.success) return { error: primeiroErro(parsed.error.issues) };

  /**
   * O limite vem **depois** da validação de formato e **antes** de consultar o código.
   *
   * Depois, porque código malformado nem chega a ser uma tentativa de adivinhar — gastar
   * a cota de quem digitou o hífen errado seria punir o engano. Antes da consulta, porque
   * é a consulta que se quer tornar cara: são 32⁴ sufixos, e sem limite o espaço inteiro
   * cabe numa tarde.
   */
  const chave = chaveDeEntrada(user.id);
  const veredito = await consomeTentativa(chave, LIMITE_DE_ENTRADA);
  if (!veredito.permitido) {
    return {
      error: `Muitas tentativas. Tente de novo em ${emLinguagemDeGente(veredito.esperarSegundos)}.`,
    };
  }

  const result = await joinProductionByCode({
    ...parsed.data,
    userId: user.id,
    userName: user.name,
  });

  // "Não existe" e "sala fechada" são mensagens diferentes porque o erro é do usuário em
  // um caso (digitou errado) e da produção no outro — e a ação de conserto é outra.
  if (result.status === 'NOT_FOUND') {
    return { error: 'Código não encontrado. Confira com quem te convidou.' };
  }
  if (result.status === 'CLOSED') {
    return { error: 'Esta sala está fechada para novas entradas.' };
  }

  // Acertou: a cota volta ao começo. Quem entra em cinco salas numa tarde não é quem o
  // limite existe para pegar, e um acerto **encerra** a adivinhação em vez de continuá-la.
  await esqueceTentativas(chave);

  revalidatePath('/producoes');
  redirect(`/p/${result.productionId}`);
}

async function admin(productionId: string): Promise<Membership> {
  return requireMember(productionId, { minRole: 'ADMIN' });
}

export async function rotacionarCodigoAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const productionId = texto(form, 'productionId');

  try {
    const membership = await admin(productionId);
    const production = await getProduction(productionId);
    if (!production) notFound();

    await rotateJoinCode({
      productionId,
      name: production.name,
      userId: membership.user.id,
    });
  } catch (error) {
    return falha(error);
  }

  revalidatePath(`/p/${productionId}`);
  return {};
}

export async function alternarEntradaAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const productionId = texto(form, 'productionId');

  try {
    const membership = await admin(productionId);
    await setJoinEnabled({
      productionId,
      enabled: texto(form, 'enabled') === 'true',
      userId: membership.user.id,
    });
  } catch (error) {
    return falha(error);
  }

  revalidatePath(`/p/${productionId}`);
  return {};
}

// ---- Membros ----

export async function salvarMembroAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const productionId = texto(form, 'productionId');

  const parsed = updateMemberSchema.safeParse({
    memberId: texto(form, 'memberId'),
    role: texto(form, 'role'),
    department: texto(form, 'department'),
    jobTitle: texto(form, 'jobTitle') || undefined,
  });

  if (!parsed.success) return { error: primeiroErro(parsed.error.issues) };

  try {
    const membership = await admin(productionId);
    const result = await updateMember({
      productionId,
      ...parsed.data,
      actor: { role: membership.role, userId: membership.user.id },
    });

    if (result.status === 'NOT_FOUND') return { error: 'Membro não encontrado.' };
    if (result.status === 'FORBIDDEN') return { error: result.reason };
  } catch (error) {
    return falha(error);
  }

  revalidatePath(`/p/${productionId}/membros`);
  return {};
}

export async function removerMembroAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const productionId = texto(form, 'productionId');
  const memberId = uuidSchema.safeParse(texto(form, 'memberId'));
  if (!memberId.success) return { error: 'Membro inválido.' };

  try {
    const membership = await admin(productionId);
    const result = await removeMember({
      productionId,
      memberId: memberId.data,
      actor: { role: membership.role, userId: membership.user.id },
    });

    if (result.status === 'NOT_FOUND') return { error: 'Membro não encontrado.' };
    if (result.status === 'FORBIDDEN') return { error: result.reason };
  } catch (error) {
    return falha(error);
  }

  revalidatePath(`/p/${productionId}/membros`);
  return {};
}

export async function transferirPosseAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const productionId = texto(form, 'productionId');
  const toMemberId = uuidSchema.safeParse(texto(form, 'memberId'));
  if (!toMemberId.success) return { error: 'Membro inválido.' };

  try {
    const membership = await requireMember(productionId, { minRole: 'OWNER' });
    const result = await transferOwnership({
      productionId,
      fromMemberId: membership.id,
      toMemberId: toMemberId.data,
      userId: membership.user.id,
    });

    if (result.status !== 'OK') return { error: 'Membro não encontrado.' };
  } catch (error) {
    return falha(error);
  }

  revalidatePath(`/p/${productionId}/membros`);
  return {};
}

export async function sairDaProducaoAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const productionId = texto(form, 'productionId');

  try {
    const membership = await requireMember(productionId);
    const result = await leaveProduction({
      productionId,
      memberId: membership.id,
      role: membership.role,
      userId: membership.user.id,
    });

    if (result.status === 'FORBIDDEN') return { error: result.reason };
  } catch (error) {
    return falha(error);
  }

  revalidatePath('/producoes');
  redirect('/producoes');
}

// ---- Diárias ----

function lerDiaria(form: FormData) {
  return shootingDaySchema.safeParse({
    date: texto(form, 'date'),
    dayNumber: texto(form, 'dayNumber'),
    unit: texto(form, 'unit'),
    location: texto(form, 'location'),
    callTime: texto(form, 'callTime'),
    wrapTime: texto(form, 'wrapTime'),
    lunchStart: texto(form, 'lunchStart'),
    lunchEnd: texto(form, 'lunchEnd'),
    notes: texto(form, 'notes'),
  });
}

/**
 * Cria ou edita — o `dayId` no formulário é o que distingue. Uma ação só porque o
 * formulário é o mesmo; separá-las duplicaria a validação inteira para ganhar um nome.
 */
export async function salvarDiariaAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const productionId = texto(form, 'productionId');
  const dayId = texto(form, 'dayId');

  const parsed = lerDiaria(form);
  if (!parsed.success) return { error: primeiroErro(parsed.error.issues) };

  try {
    const membership = await admin(productionId);

    if (dayId) {
      await updateShootingDay({
        productionId,
        dayId,
        data: parsed.data,
        userId: membership.user.id,
      });
    } else {
      await createShootingDay({
        productionId,
        data: parsed.data,
        userId: membership.user.id,
      });
    }
  } catch (error) {
    if (
      error instanceof Error &&
      /shooting_days_production_date_unit/.test(error.message)
    ) {
      return { error: 'Já existe uma diária nessa data para essa unidade.' };
    }
    return falha(error);
  }

  revalidatePath(`/p/${productionId}/diarias`);
  redirect(`/p/${productionId}/diarias`);
}

export async function excluirDiariaAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const productionId = texto(form, 'productionId');
  const dayId = uuidSchema.safeParse(texto(form, 'dayId'));
  if (!dayId.success) return { error: 'Diária inválida.' };

  try {
    const membership = await admin(productionId);
    await deleteShootingDay({
      productionId,
      dayId: dayId.data,
      userId: membership.user.id,
    });
  } catch (error) {
    return falha(error);
  }

  revalidatePath(`/p/${productionId}/diarias`);
  redirect(`/p/${productionId}/diarias`);
}

// ---- Equipamentos ----
//
// Equipamento é dado **compartilhado** (permissions.md §3): qualquer `MEMBER`+ escreve,
// independentemente do departamento. Quem chega com o kit não é sempre quem administra a
// sala, e travar o cadastro em `ADMIN` faria o catálogo nascer vazio — que é o mesmo que
// não existir.

async function membro(productionId: string): Promise<Membership> {
  return requireMember(productionId, { minRole: 'MEMBER' });
}

function lerEquipamento(form: FormData) {
  return equipmentSchema.safeParse({
    department: texto(form, 'department'),
    category: texto(form, 'category'),
    manufacturer: texto(form, 'manufacturer'),
    model: texto(form, 'model'),
    serialNumber: texto(form, 'serialNumber'),
    nickname: texto(form, 'nickname'),
    notes: texto(form, 'notes'),
  });
}

export async function salvarEquipamentoAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const productionId = texto(form, 'productionId');
  const equipmentId = texto(form, 'equipmentId');

  const parsed = lerEquipamento(form);
  if (!parsed.success) return { error: primeiroErro(parsed.error.issues) };

  try {
    const membership = await membro(productionId);

    if (equipmentId) {
      const id = uuidSchema.safeParse(equipmentId);
      if (!id.success) return { error: 'Equipamento inválido.' };

      await updateEquipment({
        id: id.data,
        productionId,
        values: parsed.data,
        actorId: membership.user.id,
      });
    } else {
      await createEquipment({
        // Aleatório, não derivado: nada aqui é criado offline, e derivar de
        // fabricante+modelo faria dois microfones idênticos sem número de série virarem
        // um registro só — o contrário do que um catálogo precisa.
        id: randomUUID(),
        productionId,
        ...parsed.data,
        actorId: membership.user.id,
      });
    }
  } catch (error) {
    return falha(error);
  }

  revalidatePath(`/p/${productionId}/equipamentos`);
  redirect(`/p/${productionId}/equipamentos`);
}

export async function excluirEquipamentoAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const productionId = texto(form, 'productionId');
  const id = uuidSchema.safeParse(texto(form, 'equipmentId'));
  if (!id.success) return { error: 'Equipamento inválido.' };

  try {
    const membership = await membro(productionId);
    await deleteEquipment({ id: id.data, productionId, actorId: membership.user.id });
  } catch (error) {
    return falha(error);
  }

  revalidatePath(`/p/${productionId}/equipamentos`);
  redirect(`/p/${productionId}/equipamentos`);
}

/**
 * Aloca um equipamento na diária — "o que estamos usando hoje" (§23).
 *
 * O departamento vem do **equipamento**, não do formulário: quem aloca um microfone está
 * alocando um equipamento de som, e deixar isso à escolha só criaria a chance de a
 * continuísta procurar o boom na lista da câmera.
 */
export async function alocarEquipamentoAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const productionId = texto(form, 'productionId');

  const parsed = assignmentSchema.safeParse({
    equipmentId: texto(form, 'equipmentId'),
    shootingDayId: texto(form, 'shootingDayId'),
    label: texto(form, 'label'),
  });
  if (!parsed.success) return { error: primeiroErro(parsed.error.issues) };

  try {
    const membership = await membro(productionId);

    const catalogo = await listEquipment(productionId);
    const item = catalogo.find((linha) => linha.id === parsed.data.equipmentId);
    if (!item) return { error: 'Equipamento não encontrado nesta produção.' };

    await assignEquipment({
      id: randomUUID(),
      productionId,
      equipmentId: item.id,
      shootingDayId: parsed.data.shootingDayId,
      department: item.department,
      label: parsed.data.label,
      actorId: membership.user.id,
    });
  } catch (error) {
    return falha(error);
  }

  revalidatePath(`/p/${productionId}/diarias/${parsed.data.shootingDayId}`);
  return {};
}

export async function desalocarEquipamentoAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const productionId = texto(form, 'productionId');
  const dayId = texto(form, 'shootingDayId');
  const id = uuidSchema.safeParse(texto(form, 'assignmentId'));
  if (!id.success) return { error: 'Alocação inválida.' };

  try {
    const membership = await membro(productionId);
    await unassignEquipment({ id: id.data, productionId, actorId: membership.user.id });
  } catch (error) {
    return falha(error);
  }

  revalidatePath(`/p/${productionId}/diarias/${dayId}`);
  return {};
}
