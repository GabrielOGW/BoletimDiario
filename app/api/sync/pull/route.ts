/**
 * `GET /api/sync/pull` — mudanças a partir do cursor.
 *
 * Também é a sonda de conectividade e o canal de presença: `navigator.onLine` mente
 * (Teradek e captive portal de locação reportam "online" sem internet), então a verdade
 * é o resultado desta requisição. E `last_seen_at` é atualizado aqui mesmo, em vez de
 * num canal separado de presença (ADR-021).
 */

import { NextResponse } from 'next/server';

import { SYNC_PROTOCOL, pullQuerySchema, type PullResponse } from '@/lib/contracts/sync';
import { touchPresence } from '@/lib/db/queries/members';
import { pullChanges } from '@/lib/db/queries/sync-read';

import { authorizeSync, protocolMismatch } from '../guard';

export async function GET(request: Request) {
  const url = new URL(request.url);

  const incompativel = protocolMismatch(Number(url.searchParams.get('protocol')));
  if (incompativel) return incompativel;

  const parsed = pullQuerySchema.safeParse({
    productionId: url.searchParams.get('productionId'),
    since: url.searchParams.get('since') ?? 0,
    limit: url.searchParams.get('limit') ?? 500,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { protocol: SYNC_PROTOCOL, error: 'INVALID_QUERY' },
      { status: 422 },
    );
  }

  const auth = await authorizeSync(parsed.data.productionId);
  if ('response' in auth) return auth.response;

  const { changes, cursor, hasMore } = await pullChanges(parsed.data);

  // Presença é efeito colateral barato do pull; falhar aqui não pode custar o pull.
  await touchPresence(auth.membership.id).catch(() => undefined);

  const response: PullResponse = { protocol: SYNC_PROTOCOL, changes, cursor, hasMore };
  return NextResponse.json(response);
}
