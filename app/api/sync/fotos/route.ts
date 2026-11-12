/**
 * `/api/sync/fotos` — os bytes das fotos de continuidade (ADR-042).
 *
 * Fica sob `/api/sync` porque é parte do protocolo: mesma checagem de versão, mesmo
 * guarda de sessão → pertencimento → papel, e quem chama é o motor de sync, nunca uma
 * tela (ADR-016).
 *
 * - `POST ?productionId&photoId` — corpo binário, `Content-Type` da imagem. Exige
 *   `MEMBER`, como o push. 409 quando o registro da foto ainda não chegou: o cliente
 *   tenta de novo no ciclo seguinte, sem perder nada.
 * - `GET  ?productionId&photoId` — devolve os bytes. Basta ser membro: ler é livre.
 */

import { NextResponse } from 'next/server';

import {
  FOTO_MAX_BYTES,
  FOTO_MIME_TYPES,
  SYNC_PROTOCOL,
  fotoQuerySchema,
} from '@/lib/contracts/sync';
import { leFotoBlob, salvaFotoBlob } from '@/lib/db/queries/fotos';

import { authorizeSync, protocolMismatch } from '../guard';

function parametros(request: Request) {
  const url = new URL(request.url);
  return {
    protocol: Number(url.searchParams.get('protocol')),
    parsed: fotoQuerySchema.safeParse({
      productionId: url.searchParams.get('productionId'),
      photoId: url.searchParams.get('photoId'),
    }),
  };
}

const invalido = (error: string, status: number, message?: string) =>
  NextResponse.json({ protocol: SYNC_PROTOCOL, error, message }, { status });

export async function POST(request: Request) {
  const { protocol, parsed } = parametros(request);

  const incompativel = protocolMismatch(protocol);
  if (incompativel) return incompativel;
  if (!parsed.success) return invalido('INVALID_QUERY', 422);

  const mimeType = (request.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!(FOTO_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return invalido('UNSUPPORTED_MEDIA_TYPE', 415, 'Formato de imagem não aceito.');
  }

  // O cabeçalho é só a primeira barreira: quem mente nele é pego pelo tamanho real.
  const declarado = Number(request.headers.get('content-length') ?? 0);
  if (declarado > FOTO_MAX_BYTES) return invalido('PAYLOAD_TOO_LARGE', 413);

  const auth = await authorizeSync(parsed.data.productionId, 'MEMBER');
  if ('response' in auth) return auth.response;

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) return invalido('EMPTY', 422);
  if (bytes.byteLength > FOTO_MAX_BYTES) return invalido('PAYLOAD_TOO_LARGE', 413);

  const resultado = await salvaFotoBlob({
    ...parsed.data,
    mimeType,
    bytes,
    actorId: auth.membership.user.id,
  });

  if (resultado === 'SEM_REGISTRO') {
    return invalido('PHOTO_NOT_SYNCED', 409, 'O registro da foto ainda não chegou.');
  }

  return NextResponse.json({ protocol: SYNC_PROTOCOL, status: 'SAVED' });
}

export async function GET(request: Request) {
  const { protocol, parsed } = parametros(request);

  const incompativel = protocolMismatch(protocol);
  if (incompativel) return incompativel;
  if (!parsed.success) return invalido('INVALID_QUERY', 422);

  const auth = await authorizeSync(parsed.data.productionId, 'VIEWER');
  if ('response' in auth) return auth.response;

  const foto = await leFotoBlob(parsed.data);
  if (!foto) return invalido('NOT_FOUND', 404);

  return new NextResponse(new Uint8Array(foto.bytes), {
    headers: {
      'Content-Type': foto.mimeType,
      // Imutável por construção, mas privada: é dado de produção, e nenhum cache
      // compartilhado no caminho pode guardá-la.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
