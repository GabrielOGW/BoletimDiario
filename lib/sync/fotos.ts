'use client';

/**
 * Transferência dos bytes das fotos de continuidade (ADR-042).
 *
 * Mora em `lib/sync` porque fala com o servidor — e é o único outro lugar além do motor
 * que pode (ADR-016). As telas continuam só com `lib/offline/repos/*`: tirar a foto grava
 * o registro e os bytes no Dexie, e é este módulo que, no ciclo do motor, os leva e traz.
 *
 * Três regras, todas sobre não atrapalhar o resto:
 *
 * - **nunca derruba o ciclo.** Foto que falha fica para o próximo; push e pull de texto
 *   não esperam nem dependem dela.
 * - **pouco por ciclo.** Três envios e quatro downloads: uma diária com quarenta fotos
 *   pendentes não segura o sync de um take por dois minutos de 4G fraco.
 * - **só desce o que vai ser usado.** Automaticamente, só as fotos de cena, plano ou
 *   take das diárias fixadas; o resto desce quando alguém abre a foto. Uma produção
 *   inteira em fotos estouraria a cota do navegador de quem só veio anotar o dia.
 */

import { SYNC_PROTOCOL } from '@/lib/contracts/sync';
import { PINS_KEY, getDb, getMeta } from '@/lib/offline/db';

const ENVIOS_POR_CICLO = 3;
const DOWNLOADS_POR_CICLO = 4;
/** Depois de uma falha, a mesma foto espera isto antes de ser pedida de novo. */
const ESPERA_APOS_FALHA_MS = 5 * 60_000;
/** Envio recusado por conteúdo (413/415/422) não é tentado de novo sem limite. */
const MAX_TENTATIVAS = 5;

const falhasRecentes = new Map<string, number>();

function podeTentar(id: string): boolean {
  const ate = falhasRecentes.get(id);
  return !ate || ate < Date.now();
}

function marcaFalha(id: string): void {
  falhasRecentes.set(id, Date.now() + ESPERA_APOS_FALHA_MS);
}

const urlDaFoto = (productionId: string, photoId: string) =>
  `/api/sync/fotos?protocol=${SYNC_PROTOCOL}&productionId=${productionId}&photoId=${photoId}`;

/** Sobe os bytes que ainda não subiram. Devolve `false` se o protocolo foi recusado. */
export async function enviaFotos(productionId: string): Promise<boolean> {
  const db = getDb();

  const pendentes = await db.photoBlobs
    .where('[productionId+uploaded]')
    .equals([productionId, 0])
    .toArray();

  let enviados = 0;
  for (const blob of pendentes) {
    if (enviados >= ENVIOS_POR_CICLO) break;
    if ((blob.attempts ?? 0) >= MAX_TENTATIVAS || !podeTentar(blob.id)) continue;

    const registro = await db.continuityPhotos.get(blob.id);
    // Sem registro ou com o registro ainda na fila: o servidor responderia 409. Espera
    // o push levar o registro primeiro — é a ordem que autoriza os bytes.
    if (!registro || registro._dirty || registro.deletedAt) continue;

    enviados += 1;
    let resposta: Response;
    try {
      resposta = await fetch(urlDaFoto(productionId, blob.id), {
        method: 'POST',
        headers: { 'content-type': blob.mimeType },
        body: blob.bytes,
      });
    } catch {
      marcaFalha(blob.id);
      return true;
    }

    if (resposta.status === 426) return false;

    if (resposta.ok) {
      await db.photoBlobs.update(blob.id, { uploaded: 1 });
      continue;
    }

    marcaFalha(blob.id);
    // 409 = registro ainda não chegou; 401/403/5xx = tenta depois. Só o que o servidor
    // recusou **pelo conteúdo** conta tentativa — e mesmo assim os bytes ficam aqui.
    if ([413, 415, 422].includes(resposta.status)) {
      await db.photoBlobs.update(blob.id, { attempts: (blob.attempts ?? 0) + 1 });
    }
  }

  return true;
}

/** Quais fotos interessam a este aparelho: as das diárias fixadas. */
async function fotosDasDiariasFixadas(productionId: string): Promise<string[]> {
  const db = getDb();
  const pins = await getMeta<string[]>(PINS_KEY, []);
  if (pins.length === 0) return [];

  const setups = (await db.setups.where('shootingDayId').anyOf(pins).toArray()).filter(
    (setup) => setup.productionId === productionId,
  );
  const setupIds = setups.map((setup) => setup.id);
  const sceneIds = [...new Set(setups.map((setup) => setup.sceneId))];
  const takeIds = (await db.takes.where('setupId').anyOf(setupIds).toArray()).map(
    (take) => take.id,
  );

  const consultas = await Promise.all([
    db.continuityPhotos.where('sceneId').anyOf(sceneIds).toArray(),
    db.continuityPhotos.where('setupId').anyOf(setupIds).toArray(),
    db.continuityPhotos.where('takeId').anyOf(takeIds).toArray(),
  ]);

  return [
    ...new Set(
      consultas
        .flat()
        .filter((foto) => !foto.deletedAt && foto.productionId === productionId)
        .map((foto) => foto.id),
    ),
  ];
}

/**
 * Há espaço para descer mais fotos?
 *
 * Abaixo de 15% livres o download automático para: o espaço que sobrou é do texto da
 * diária, que é o que não pode faltar. A foto continua descendo se alguém a abrir.
 */
async function temFolga(): Promise<boolean> {
  try {
    const estimativa = await navigator.storage?.estimate?.();
    if (!estimativa?.quota || estimativa.usage === undefined) return true;
    return estimativa.usage / estimativa.quota < 0.85;
  } catch {
    return true;
  }
}

/** Baixa uma foto agora — usado quando alguém abre uma que ainda não desceu. */
export async function baixaFoto(productionId: string, photoId: string): Promise<boolean> {
  const db = getDb();
  if (await db.photoBlobs.get(photoId)) return true;
  if (!podeTentar(photoId)) return false;

  let resposta: Response;
  try {
    resposta = await fetch(urlDaFoto(productionId, photoId), { cache: 'no-store' });
  } catch {
    marcaFalha(photoId);
    return false;
  }

  if (!resposta.ok) {
    marcaFalha(photoId);
    return false;
  }

  const bytes = await resposta.arrayBuffer();
  await db.photoBlobs.put({
    id: photoId,
    productionId,
    mimeType: resposta.headers.get('content-type') ?? 'image/jpeg',
    bytes,
    uploaded: 1,
  });
  return true;
}

/** Desce as fotos das diárias fixadas que ainda não estão neste aparelho. */
export async function baixaFotos(productionId: string): Promise<void> {
  if (!(await temFolga())) return;

  const db = getDb();
  const ids = await fotosDasDiariasFixadas(productionId);
  const presentes = new Set(
    (await db.photoBlobs.bulkGet(ids)).filter(Boolean).map((blob) => blob?.id),
  );

  const faltando = ids.filter((id) => !presentes.has(id) && podeTentar(id));
  for (const id of faltando.slice(0, DOWNLOADS_POR_CICLO)) {
    await baixaFoto(productionId, id);
  }
}

/** O passo das fotos no ciclo do motor. Nunca lança. */
export async function sincronizaFotos(productionId: string): Promise<boolean> {
  try {
    const protocoloAceito = await enviaFotos(productionId);
    if (!protocoloAceito) return false;
    await baixaFotos(productionId);
  } catch {
    // Foto é carga útil, não estado: falhar aqui não pode afetar o sync de texto.
  }
  return true;
}
