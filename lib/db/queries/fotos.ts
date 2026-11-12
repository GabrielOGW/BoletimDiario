/**
 * Os bytes das fotos de continuidade (ADR-042) — fora do `sync_log`.
 *
 * O registro da foto (`continuity_photos`) sincroniza como qualquer entidade; os bytes
 * moram aqui e só sobem uma vez. Duas regras seguram o desenho:
 *
 * - **o registro vem antes dos bytes.** Uma foto só é aceita se `continuity_photos` já
 *   tiver a linha, na mesma produção. É a autorização real: quem envia bytes prova que
 *   está mandando a foto *de um registro que ele pode ver*, e não um arquivo solto num
 *   id inventado. O motor do cliente sobe o push antes das fotos, e um 409 aqui só quer
 *   dizer "tente no próximo ciclo".
 * - **imutável.** `on conflict do nothing`: reenviar depois de um timeout é seguro, e
 *   nenhuma requisição troca os bytes de uma foto existente — editar é tirar outra.
 */

import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { continuityPhotoBlobs, continuityPhotos } from '@/lib/db/schema';

export type ResultadoDoEnvio = 'SALVA' | 'SEM_REGISTRO';

export async function salvaFotoBlob(input: {
  productionId: string;
  photoId: string;
  mimeType: string;
  bytes: Uint8Array;
  actorId: string;
}): Promise<ResultadoDoEnvio> {
  const registro = await db
    .select({ id: continuityPhotos.id })
    .from(continuityPhotos)
    .where(
      and(
        eq(continuityPhotos.id, input.photoId),
        eq(continuityPhotos.productionId, input.productionId),
      ),
    )
    .limit(1);

  if (registro.length === 0) return 'SEM_REGISTRO';

  await db
    .insert(continuityPhotoBlobs)
    .values({
      photoId: input.photoId,
      productionId: input.productionId,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
      dataBase64: Buffer.from(input.bytes).toString('base64'),
      createdBy: input.actorId,
    })
    .onConflictDoNothing({ target: continuityPhotoBlobs.photoId });

  return 'SALVA';
}

/**
 * Os bytes de uma foto, ou `null`.
 *
 * Recortado por `production_id` **e** pela foto não estar apagada: quem apagou uma foto
 * não espera que ela continue descendo para os aparelhos da equipe.
 */
export async function leFotoBlob(input: {
  productionId: string;
  photoId: string;
}): Promise<{ mimeType: string; bytes: Buffer } | null> {
  const linhas = await db
    .select({
      mimeType: continuityPhotoBlobs.mimeType,
      dataBase64: continuityPhotoBlobs.dataBase64,
    })
    .from(continuityPhotoBlobs)
    .innerJoin(continuityPhotos, eq(continuityPhotos.id, continuityPhotoBlobs.photoId))
    .where(
      and(
        eq(continuityPhotoBlobs.photoId, input.photoId),
        eq(continuityPhotoBlobs.productionId, input.productionId),
        isNull(continuityPhotos.deletedAt),
      ),
    )
    .limit(1);

  const linha = linhas[0];
  if (!linha) return null;

  return { mimeType: linha.mimeType, bytes: Buffer.from(linha.dataBase64, 'base64') };
}
