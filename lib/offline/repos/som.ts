'use client';

/**
 * Repositório do módulo de Som — dentro da fronteira offline.
 *
 * Separado de `diaria.ts` pelo mesmo motivo de `camera.ts`: o que muda aqui é o
 * **departamento**, não a estrutura. Cena, setup e take continuam sendo os mesmos,
 * compartilhados; o Som apenas anexa dados a eles.
 *
 * Nenhum `fetch`, como em todo lugar dentro da fronteira (ADR-016).
 */

import { deriveId } from '@/domain/platform/derive-id';
import { getDb, type LocalSoundDayConfig, type LocalSoundTakeData } from '../db';
import type { LocalSoundTakeTrack } from '../db';

import { createEntity, listSetups, listTakes, patchEntity, softDelete } from './diaria';

// ---- Configuração da diária ----

/** Id derivado da diária: a configuração é uma só, e duas pessoas criam a mesma. */
export const soundDayConfigId = (shootingDayId: string) =>
  deriveId('soundDayConfig', shootingDayId);

export async function getSoundDayConfig(
  shootingDayId: string,
): Promise<LocalSoundDayConfig | undefined> {
  const linha = await getDb().soundDayConfig.get(soundDayConfigId(shootingDayId));
  return linha?.deletedAt ? undefined : linha;
}

/**
 * Garante a configuração de som da diária.
 *
 * Idempotente pelo id derivado: o mixer e o boom abrindo a diária ao mesmo tempo, cada um
 * sem rede, produzem **o mesmo registro** em vez de duas configurações concorrentes para
 * um dia que só tem uma (ADR-019).
 */
export async function ensureSoundDayConfig(input: {
  productionId: string;
  shootingDayId: string;
}): Promise<string> {
  const id = soundDayConfigId(input.shootingDayId);

  const existente = await getDb().soundDayConfig.get(id);
  if (existente && !existente.deletedAt) return id;

  return createEntity('soundDayConfig', id, {
    id,
    productionId: input.productionId,
    shootingDayId: input.shootingDayId,
    version: 0,
    _dirty: 1,
  } as unknown as LocalSoundDayConfig & Record<string, unknown>);
}

export async function patchSoundDayConfig(
  id: string,
  changes: Record<string, unknown>,
): Promise<void> {
  await patchEntity('soundDayConfig', id, changes);
}

// ---- Dados de som por take ----

/** Um por take: o som não é multicam, e a chave natural é o próprio take. */
export const soundTakeDataId = (takeId: string) => deriveId('soundTakeData', takeId);

export async function listSoundTakeData(
  takeIds: string[],
): Promise<LocalSoundTakeData[]> {
  if (takeIds.length === 0) return [];
  const linhas = await getDb().soundTakeData.where('takeId').anyOf(takeIds).toArray();
  return linhas.filter((linha) => !linha.deletedAt);
}

/**
 * Garante a linha de som do take, **nascida preenchida**.
 *
 * Herda do take anterior do mesmo setup o sound roll e o nome do arquivo incrementado —
 * e nada mais. Julgamento, motivo de NG e timecode são de cada take: herdá-los seria
 * afirmar por conta própria coisas que ninguém disse.
 */
export async function ensureSoundTakeData(input: {
  productionId: string;
  setupId: string;
  takeId: string;
  takeNumber: number;
  /** Quando informado, o roll da diária serve de origem para o primeiro take. */
  shootingDayId?: string;
}): Promise<string> {
  const db = getDb();
  const id = soundTakeDataId(input.takeId);

  const existente = await db.soundTakeData.get(id);
  if (existente && !existente.deletedAt) return id;

  const herdado = await doTakeAnterior(input);

  return createEntity('soundTakeData', id, {
    ...herdado,
    id,
    productionId: input.productionId,
    takeId: input.takeId,
    circled: false,
    version: 0,
    _dirty: 1,
  } as unknown as LocalSoundTakeData & Record<string, unknown>);
}

async function doTakeAnterior(input: {
  setupId: string;
  takeNumber: number;
  shootingDayId?: string;
}): Promise<{ soundRoll?: string | null; fileName?: string | null }> {
  const takesDoSetup = await listTakes([input.setupId]);

  const anterior = takesDoSetup
    .filter((take) => take.number < input.takeNumber)
    .sort((a, b) => b.number - a.number)[0];

  const dados = anterior
    ? await getDb().soundTakeData.get(soundTakeDataId(anterior.id))
    : undefined;

  // Primeiro take do setup: o roll é o **da diária**, e não vazio (§30). Sem isto, todo
  // plano novo começaria com o campo em branco no meio da gravação, que é exatamente a
  // hora em que ninguém vai lembrar de redigitá-lo.
  if (!dados) {
    if (!input.shootingDayId) return {};
    const config = await getSoundDayConfig(input.shootingDayId);
    return config?.roll ? { soundRoll: config.roll } : {};
  }

  const { incrementSuffix } = await import('@/utils/sequence');
  return {
    soundRoll: dados.soundRoll ?? null,
    fileName: dados.fileName ? incrementSuffix(dados.fileName) : null,
  };
}

export async function patchSoundTakeData(
  id: string,
  changes: Record<string, unknown>,
): Promise<void> {
  await patchEntity('soundTakeData', id, changes);
}

// ---- Tracks ----

/** Id derivado de `(take, índice)`: cada canal converge sozinho, sem lista ordenada. */
export const soundTrackId = (takeId: string, index: number) =>
  deriveId('soundTakeTrack', takeId, String(index));

export async function listSoundTracks(takeIds: string[]): Promise<LocalSoundTakeTrack[]> {
  if (takeIds.length === 0) return [];
  const linhas = await getDb().soundTakeTracks.where('takeId').anyOf(takeIds).toArray();
  return linhas
    .filter((linha) => !linha.deletedAt)
    .sort((a, b) => a.index - b.index || a.takeId.localeCompare(b.takeId));
}

export async function createSoundTrack(input: {
  productionId: string;
  takeId: string;
  index: number;
  name?: string | null;
  source?: string | null;
}): Promise<string> {
  const id = soundTrackId(input.takeId, input.index);

  return createEntity('soundTakeTrack', id, {
    ...input,
    name: input.name ?? null,
    source: input.source ?? null,
    id,
    version: 0,
    _dirty: 1,
  } as unknown as LocalSoundTakeTrack & Record<string, unknown>);
}

export async function patchSoundTrack(
  id: string,
  changes: Record<string, unknown>,
): Promise<void> {
  await patchEntity('soundTakeTrack', id, changes);
}

/** Remover um canal é exclusão lógica, como tudo mais — o take antigo não muda. */
export async function removeSoundTrack(id: string): Promise<void> {
  await softDelete('soundTakeTrack', id);
}

/**
 * Garante as tracks do take, **herdando o layout do último take que teve um**.
 *
 * É o ponto onde o módulo de Som ganha ou perde o usuário (sound.md §2): redigitar quatro
 * canais a cada take é inaceitável em set, e um mixer que precise disso volta ao caderno
 * no primeiro dia.
 *
 * A origem é o take anterior, **não** um layout guardado na diária. Um template no
 * `sound_day_config` seria uma segunda verdade sobre o mesmo dado — e uma lista dentro de
 * um registro não tem merge por campo, que é exatamente o motivo de as tracks serem tabela
 * (ADR-033). Herdando do take anterior, o layout se propaga sozinho e cada take guarda o
 * que ele realmente teve: mudar o canal 3 hoje não reescreve o take de uma hora atrás,
 * que é o que um relatório de custódia precisa.
 *
 * As `notes` **não** são herdadas: "lav estalando" é daquele take.
 */
export async function ensureSoundTracks(input: {
  productionId: string;
  shootingDayId: string;
  setupId: string;
  takeId: string;
}): Promise<void> {
  const existentes = await listSoundTracks([input.takeId]);
  if (existentes.length > 0) return;

  const modelo = await tracksDoTakeAnterior(input);

  for (const track of modelo) {
    await createSoundTrack({
      productionId: input.productionId,
      takeId: input.takeId,
      index: track.index,
      name: track.name ?? null,
      source: track.source ?? null,
    });
  }
}

/**
 * O take anterior na ordem de leitura da diária — plano, depois número.
 *
 * Procurar só dentro do setup deixaria todo plano novo começando sem canais, que é o mesmo
 * problema com outro nome. Não achando nada antes, vale o último take com tracks do dia:
 * quem volta para anotar uma cena esquecida também herda.
 */
async function tracksDoTakeAnterior(input: {
  shootingDayId: string;
  takeId: string;
}): Promise<LocalSoundTakeTrack[]> {
  const setups = await listSetups(input.shootingDayId);
  const ordem = new Map(setups.map((setup, indice) => [setup.id, indice]));

  const takes = (await listTakes(setups.map((setup) => setup.id))).sort(
    (a, b) =>
      (ordem.get(a.setupId) ?? 0) - (ordem.get(b.setupId) ?? 0) || a.number - b.number,
  );

  const posicao = takes.findIndex((take) => take.id === input.takeId);
  const anteriores = posicao === -1 ? takes : takes.slice(0, posicao);

  const tracks = await listSoundTracks(anteriores.map((take) => take.id));
  if (tracks.length === 0) return [];

  const ultimo = anteriores
    .filter((take) => tracks.some((track) => track.takeId === take.id))
    .pop();

  return tracks
    .filter((track) => track.takeId === ultimo?.id)
    .sort((a, b) => a.index - b.index);
}

/** O próximo índice livre de canal — 1..N, sem buraco no meio do relatório. */
export function proximoIndiceDeTrack(tracks: LocalSoundTakeTrack[]): number {
  return tracks.reduce((maior, track) => Math.max(maior, track.index), 0) + 1;
}
