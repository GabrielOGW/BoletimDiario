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
import { SYNC_ENTITIES, sameValue, type FieldKind } from '@/lib/contracts/sync';
import {
  getDb,
  getMeta,
  setMeta,
  type LocalCameraTakeData,
  type LocalCameraUnit,
} from '../db';

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

  // Take 1 nasce do rascunho do plano; os seguintes, do take anterior. Nos dois casos o
  // take "nasce preenchido", que é a diferença entre dois toques e redigitar tudo.
  const herdado =
    (await takeAnterior(input)) ??
    (await getPlanoDraft(input.setupId, input.cameraUnitId));

  return createEntity('cameraTakeData', id, {
    ...herdado,
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

// ---- Os campos técnicos do Plano ----

/**
 * Editar técnica/óptica no cartão do Plano, do jeito que o boletim sempre fez.
 *
 * O valor mora nos takes (ADR-011), mas quem edita está olhando para o **plano**. Então
 * a mudança acompanha todos os takes que ainda tinham o valor antigo — e **não** toca no
 * take que alguém ajustou à mão. Isso é o que a pessoa espera: "mudei o ISO do plano"
 * conserta o plano, sem apagar a exceção que ela mesma criou dois takes atrás.
 *
 * Sem take ainda, o valor vai para um rascunho local (ver `savePlanoDraft`): o boletim
 * permite configurar o plano antes de rodar, e essa possibilidade não pode sumir.
 */
export async function patchPlanoTecnica(input: {
  setupId: string;
  cameraUnitId: string | null;
  field: string;
  valorAnterior: unknown;
  valorNovo: unknown;
}): Promise<void> {
  const db = getDb();
  const takes = await listTakes([input.setupId]);

  if (takes.length === 0) {
    await savePlanoDraft(input.setupId, input.cameraUnitId, {
      [input.field]: input.valorNovo,
    });
    return;
  }

  const kind = (SYNC_ENTITIES.cameraTakeData.fields as Record<string, FieldKind>)[
    input.field
  ];

  for (const take of takes) {
    const id = cameraTakeDataId(take.id, input.cameraUnitId);
    const dados = await db.cameraTakeData.get(id);
    if (!dados) continue;

    const atual = (dados as unknown as Record<string, unknown>)[input.field] ?? null;
    if (!sameValue(kind, atual, input.valorAnterior)) continue;

    await patchCameraTakeData(id, { [input.field]: input.valorNovo });
  }
}

/**
 * Rascunho do plano sem takes.
 *
 * Vive em `meta` e **não sincroniza**, de propósito: é rascunho de interface, não dado de
 * produção. No instante em que o take 1 nasce, ele vira dado de verdade e o rascunho
 * some. Guardá-lo em `meta` em vez de em estado de componente é o que faz o valor
 * sobreviver a fechar o app antes de rodar o primeiro take.
 */
const draftKey = (setupId: string, cameraUnitId: string | null) =>
  `planoDraft:${setupId}:${cameraUnitId ?? ''}`;

export async function getPlanoDraft(
  setupId: string,
  cameraUnitId: string | null,
): Promise<Record<string, unknown>> {
  return getMeta<Record<string, unknown>>(draftKey(setupId, cameraUnitId), {});
}

export async function savePlanoDraft(
  setupId: string,
  cameraUnitId: string | null,
  changes: Record<string, unknown>,
): Promise<void> {
  const atual = await getPlanoDraft(setupId, cameraUnitId);
  await setMeta(draftKey(setupId, cameraUnitId), { ...atual, ...changes });
}

/**
 * O valor que o cartão do Plano mostra.
 *
 * É o do último take — o mesmo que o próximo take herdaria. Sem takes, é o rascunho.
 */
export async function planoTecnica(
  setupId: string,
  cameraUnitId: string | null,
): Promise<Record<string, unknown>> {
  const takes = await listTakes([setupId]);
  const ultimo = takes[takes.length - 1];

  if (!ultimo) return getPlanoDraft(setupId, cameraUnitId);

  const dados = await getDb().cameraTakeData.get(
    cameraTakeDataId(ultimo.id, cameraUnitId),
  );

  return (dados as unknown as Record<string, unknown>) ?? {};
}
