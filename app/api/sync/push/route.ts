/**
 * `POST /api/sync/push` — a fila do dispositivo chegando ao servidor.
 *
 * Exige `MEMBER`: `VIEWER` lê a diária inteira e não escreve nada nela. Quem perdeu a
 * permissão com fila pendente recebe 403, e o cliente marca as operações como `FAILED`
 * **sem descartar o conteúdo** — o usuário ainda consegue exportá-lo.
 */

import { NextResponse } from 'next/server';

import {
  SYNC_PROTOCOL,
  pushRequestSchema,
  type PushResponse,
} from '@/lib/contracts/sync';
import { pushOperations } from '@/lib/db/queries/sync';

import { authorizeSync, protocolMismatch } from '../guard';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = pushRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        protocol: SYNC_PROTOCOL,
        error: 'INVALID_PAYLOAD',
        message: parsed.error.issues[0]?.message ?? 'Lote inválido.',
      },
      { status: 422 },
    );
  }

  const incompativel = protocolMismatch(parsed.data.protocol);
  if (incompativel) return incompativel;

  const auth = await authorizeSync(parsed.data.productionId, 'MEMBER');
  if ('response' in auth) return auth.response;

  const results = await pushOperations({
    productionId: parsed.data.productionId,
    actorId: auth.membership.user.id,
    operations: parsed.data.operations,
  });

  const response: PushResponse = { protocol: SYNC_PROTOCOL, results };
  return NextResponse.json(response);
}
