'use server';

/**
 * Server Actions da conta.
 *
 * Revogar sessão é escrita no servidor e nada mais: sem outbox, sem cursor, sem Dexie.
 * Fica fora da fronteira offline como o resto da preparação (ADR-016) — e, ao contrário
 * do preenchimento da diária, **exige rede**, o que aqui é inofensivo: quem está
 * derrubando o acesso de um aparelho perdido está sentado, com sinal.
 */

import { revalidatePath } from 'next/cache';

import { revogarDispositivo, revogarOutrosDispositivos } from '@/lib/auth/dispositivos';
import { requireUser } from '@/lib/auth/session';

export interface ActionState {
  error?: string;
}

export async function revogarDispositivoAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireUser();

  const token = form.get('token');
  if (typeof token !== 'string' || !token) return { error: 'Sessão não encontrada.' };

  // A Better Auth só revoga sessão **da própria conta** — o token de outra pessoa não é
  // encontrado e a chamada não faz nada. Não há como derrubar terceiro por aqui.
  await revogarDispositivo(token);

  revalidatePath('/conta');
  return {};
}

export async function revogarOutrosAction(
  _prev: ActionState,
  /** Vem de `useActionState` sem `<form>`: não há payload, e é isso mesmo. */
  _payload?: FormData,
): Promise<ActionState> {
  await requireUser();
  await revogarOutrosDispositivos();

  revalidatePath('/conta');
  return {};
}
