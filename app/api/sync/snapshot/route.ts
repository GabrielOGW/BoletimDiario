/**
 * `GET /api/sync/snapshot?shootingDayId=…` — a fixação da diária.
 *
 * É a única requisição que a diária **precisa** ter feito alguma vez para funcionar sem
 * rede. Depois dela, tudo é local: o pull só traz novidade, e o push só leva pendência.
 *
 * A produção não vem na query: ela é lida da própria diária. Aceitar as duas permitiria
 * pedir a diária de uma produção passando o id de outra da qual se é membro.
 */

import { NextResponse } from 'next/server';

import { sql } from 'drizzle-orm';

import {
  SYNC_PROTOCOL,
  snapshotQuerySchema,
  type SnapshotResponse,
} from '@/lib/contracts/sync';
import { db } from '@/lib/db/client';
import { getSessionUser } from '@/lib/auth/session';
import { loadSnapshot } from '@/lib/db/queries/sync-read';

import { authorizeSync, protocolMismatch } from '../guard';

export async function GET(request: Request) {
  const url = new URL(request.url);

  const incompativel = protocolMismatch(Number(url.searchParams.get('protocol')));
  if (incompativel) return incompativel;

  const parsed = snapshotQuerySchema.safeParse({
    shootingDayId: url.searchParams.get('shootingDayId'),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { protocol: SYNC_PROTOCOL, error: 'INVALID_QUERY' },
      { status: 422 },
    );
  }

  // Sessão **antes** da consulta: sem isto, "404 porque a diária não existe" e "401
  // porque você não entrou" seriam distinguíveis por quem só tem o id — a mesma classe
  // de vazamento que o 404-em-vez-de-403 do `requireMember` fecha.
  if (!(await getSessionUser())) {
    return NextResponse.json(
      { protocol: SYNC_PROTOCOL, error: 'UNAUTHENTICATED' },
      { status: 401 },
    );
  }

  const dono = await db.execute<{ production_id: string }>(sql`
    select production_id::text as production_id from shooting_days
     where id = ${parsed.data.shootingDayId} and deleted_at is null
     limit 1
  `);

  const productionId = dono.rows[0]?.production_id;
  if (!productionId) {
    return NextResponse.json(
      { protocol: SYNC_PROTOCOL, error: 'NOT_FOUND' },
      { status: 404 },
    );
  }

  const auth = await authorizeSync(productionId, 'VIEWER');
  if ('response' in auth) return auth.response;

  const snapshot = await loadSnapshot({
    productionId,
    shootingDayId: parsed.data.shootingDayId,
  });

  if (!snapshot) {
    return NextResponse.json(
      { protocol: SYNC_PROTOCOL, error: 'NOT_FOUND' },
      { status: 404 },
    );
  }

  const response: SnapshotResponse = {
    protocol: SYNC_PROTOCOL,
    productionId,
    ...snapshot,
  };

  return NextResponse.json(response);
}
