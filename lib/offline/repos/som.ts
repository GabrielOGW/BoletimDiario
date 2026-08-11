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

import { createEntity, listTakes, patchEntity } from './diaria';

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
}): Promise<{ soundRoll?: string | null; fileName?: string | null }> {
  const takesDoSetup = await listTakes([input.setupId]);

  const anterior = takesDoSetup
    .filter((take) => take.number < input.takeNumber)
    .sort((a, b) => b.number - a.number)[0];

  if (!anterior) return {};

  const dados = await getDb().soundTakeData.get(soundTakeDataId(anterior.id));
  if (!dados) return {};

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
