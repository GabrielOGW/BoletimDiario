/**
 * O que toda rota de sync faz antes de qualquer outra coisa.
 *
 * A ordem é a de `docs/architecture/permissions.md §3` e nenhum passo é opcional:
 * protocolo → sessão → pertencimento → papel. O 426 vem primeiro de propósito: um
 * cliente velho não deve nem chegar a consultar o banco.
 */

import 'server-only';

import { NextResponse } from 'next/server';

import { SYNC_PROTOCOL } from '@/lib/contracts/sync';
import { ForbiddenError, NotAMemberError, requireMember } from '@/lib/auth/guards';
import { getSessionUser } from '@/lib/auth/session';
import type { MemberRole } from '@/domain/platform/enums';
import type { Membership } from '@/lib/auth/guards';

export function protocolMismatch(protocol: number): NextResponse | null {
  if (protocol === SYNC_PROTOCOL) return null;

  return NextResponse.json(
    {
      protocol: SYNC_PROTOCOL,
      error: 'PROTOCOL_MISMATCH',
      message: 'Atualize o app para continuar sincronizando.',
    },
    { status: 426 },
  );
}

/**
 * Autoriza e devolve a associação — ou a resposta de erro pronta.
 *
 * Devolve resposta em vez de lançar porque uma rota de sync **nunca** pode virar 500 por
 * falta de permissão: o cliente precisa da distinção entre "tente de novo" (5xx, a fila
 * espera) e "isto não vai passar" (4xx, a operação vira FAILED com motivo).
 *
 * Sem sessão é 401, e não redirect: quem chama é `fetch`, não navegador.
 */
export async function authorizeSync(
  productionId: string,
  minRole: MemberRole = 'MEMBER',
): Promise<{ membership: Membership } | { response: NextResponse }> {
  const user = await getSessionUser();
  if (!user) {
    return {
      response: NextResponse.json(
        { protocol: SYNC_PROTOCOL, error: 'UNAUTHENTICATED' },
        { status: 401 },
      ),
    };
  }

  try {
    return { membership: await requireMember(productionId, { minRole }) };
  } catch (error) {
    if (error instanceof NotAMemberError) {
      return {
        response: NextResponse.json(
          { protocol: SYNC_PROTOCOL, error: 'NOT_FOUND' },
          { status: 404 },
        ),
      };
    }
    if (error instanceof ForbiddenError) {
      return {
        response: NextResponse.json(
          { protocol: SYNC_PROTOCOL, error: 'FORBIDDEN', message: error.message },
          { status: 403 },
        ),
      };
    }
    throw error;
  }
}
