'use client';

/**
 * Repositório do módulo de Câmera — dentro da fronteira offline.
 *
 * Ele existe separado de `diaria.ts` porque o que muda aqui é o **departamento**, não a
 * estrutura: cena, setup e take continuam sendo os mesmos, compartilhados. Câmera
 * apenas anexa dados a eles.
 *
 * Nenhum `fetch`, como em todo lugar dentro da fronteira (ADR-016).
 */

import { deriveId } from '@/domain/platform/derive-id';
import { inheritCameraFlat } from '@/domain/platform/factory';
import { getDb, type LocalCameraTakeData, type LocalCameraUnit } from '../db';

import { createEntity, listTakes, patchEntity } from './diaria';

// ---- Câmeras cadastradas ----

export async function listCameraUnits(productionId: string): Promise<LocalCameraUnit[]> {
  const rows = await getDb()
    .cameraUnits.where('productionId')
    .equals(productionId)
    .toArray();

  return rows
    .filter((unit) => !unit.deletedAt)
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { numeric: true }));
}

/**
 * Cria uma câmera com id derivado de `(produção, etiqueta)`.
 *
 * Duas pessoas cadastrando "Camera A" no mesmo dia produzem o mesmo registro em vez de
 * duas câmeras A — a mesma convergência que vale para take (ADR-019).
 */
export async function createCameraUnit(input: {
  productionId: string;
  label: string;
  model?: string | null;
  operator?: string | null;
  focusPuller?: string | null;
  clapper?: string | null;
}): Promise<string> {
  const label = input.label.trim().toUpperCase();
  const id = deriveId('cameraUnit', input.productionId, label);

  return createEntity('cameraUnit', id, {
    ...input,
    label,
    id,
    productionId: input.productionId,
    version: 0,
    _dirty: 1,
  } as unknown as LocalCameraUnit & Record<string, unknown>);
}

export async function patchCameraUnit(
  id: string,
  changes: Record<string, unknown>,
): Promise<void> {
  await patchEntity('cameraUnit', id, changes);
}

// ---- Dados de câmera por take ----

/** Id derivado de `(take, câmera)` — multicam sem colisão e sem remapeamento. */
export function cameraTakeDataId(takeId: string, cameraUnitId: string | null): string {
  return deriveId('cameraTakeData', takeId, cameraUnitId ?? '');
}

export async function listCameraTakeData(
  takeIds: string[],
): Promise<LocalCameraTakeData[]> {
  if (takeIds.length === 0) return [];
  const rows = await getDb().cameraTakeData.where('takeId').anyOf(takeIds).toArray();
  return rows.filter((row) => !row.deletedAt);
}

/**
 * Garante que exista a linha de câmera daquele take, **nascida preenchida**.
 *
 * Herda do take anterior do mesmo setup e da mesma câmera: cartão, roll, lente, T-stop,
 * ISO — tudo menos aprovação, status e notas, e com o sufixo do nome do arquivo
 * incrementado (§29). A regra é do domínio, não daqui: `inheritCameraFlat`.
 *
 * É idempotente pelo id derivado, então chamar duas vezes não cria duas linhas.
 */
export async function ensureCameraTakeData(input: {
  productionId: string;
  setupId: string;
  takeId: string;
  takeNumber: number;
  cameraUnitId: string | null;
}): Promise<string> {
  const db = getDb();
  const id = cameraTakeDataId(input.takeId, input.cameraUnitId);

  const existente = await db.cameraTakeData.get(id);
  if (existente && !existente.deletedAt) return id;

  const anteriores = await takeAnterior(input);

  return createEntity('cameraTakeData', id, {
    ...(anteriores ?? {}),
    id,
    productionId: input.productionId,
    takeId: input.takeId,
    cameraUnitId: input.cameraUnitId,
    approved: false,
    version: 0,
    _dirty: 1,
  } as unknown as LocalCameraTakeData & Record<string, unknown>);
}

/** O dado de câmera do take imediatamente anterior do mesmo setup e da mesma câmera. */
async function takeAnterior(input: {
  setupId: string;
  takeNumber: number;
  cameraUnitId: string | null;
}): Promise<Record<string, unknown> | null> {
  const takesDoSetup = await listTakes([input.setupId]);

  const anterior = takesDoSetup
    .filter((take) => take.number < input.takeNumber)
    .sort((a, b) => b.number - a.number)[0];

  if (!anterior) return null;

  const dados = await getDb().cameraTakeData.get(
    cameraTakeDataId(anterior.id, input.cameraUnitId),
  );

  return dados ? inheritCameraFlat(dados as unknown as Record<string, unknown>) : null;
}

export async function patchCameraTakeData(
  id: string,
  changes: Record<string, unknown>,
): Promise<void> {
  await patchEntity('cameraTakeData', id, changes);
}
