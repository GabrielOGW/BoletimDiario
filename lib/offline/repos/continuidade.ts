'use client';

/**
 * Repositório do módulo de Continuidade — dentro da fronteira offline.
 *
 * Separado de `diaria.ts` pelo mesmo motivo de `camera.ts` e `som.ts`: o que muda aqui é o
 * **departamento**, não a estrutura. Cena, setup e take continuam sendo os mesmos,
 * compartilhados; a Continuidade anexa dados a eles — e, diferentemente dos outros dois,
 * também descreve o **estado do mundo** em volta deles.
 *
 * Nenhum `fetch`, como em todo lugar dentro da fronteira (ADR-016).
 */

import { deriveId } from '@/domain/platform/derive-id';
import type { SyncEntityType } from '@/lib/contracts/sync';

import {
  getDb,
  type LocalContinuityHairMakeup,
  type LocalContinuityProp,
  type LocalContinuitySetDressing,
  type LocalContinuityTakeData,
  type LocalContinuityWardrobe,
  type LocalDailyProgressReport,
} from '../db';

import { createEntity, patchEntity, softDelete } from './diaria';

// ---- Continuidade de ação, por take ----

/** Um por take: a continuidade não é multicam, e a chave natural é o próprio take. */
export const continuityTakeDataId = (takeId: string) =>
  deriveId('continuityTakeData', takeId);

export async function listContinuityTakeData(
  takeIds: string[],
): Promise<LocalContinuityTakeData[]> {
  if (takeIds.length === 0) return [];
  const linhas = await getDb()
    .continuityTakeData.where('takeId')
    .anyOf(takeIds)
    .toArray();
  return linhas.filter((linha) => !linha.deletedAt);
}

/**
 * Garante a linha de continuidade do take, **vazia**.
 *
 * Nada é herdado do take anterior, e isso é decisão, não esquecimento: o que a
 * continuidade registra é o que **aconteceu neste take**. Herdar "João entra pela
 * esquerda" faria o take 4 afirmar sozinho algo que ninguém observou — e um registro de
 * continuidade que afirma por conta própria é pior que um campo em branco, porque a
 * montagem confia nele.
 */
export async function ensureContinuityTakeData(input: {
  productionId: string;
  takeId: string;
}): Promise<string> {
  const id = continuityTakeDataId(input.takeId);

  const existente = await getDb().continuityTakeData.get(id);
  if (existente && !existente.deletedAt) return id;

  return createEntity('continuityTakeData', id, {
    id,
    productionId: input.productionId,
    takeId: input.takeId,
    selected: false,
    version: 0,
    _dirty: 1,
  } as unknown as LocalContinuityTakeData & Record<string, unknown>);
}

export async function patchContinuityTakeData(
  id: string,
  changes: Record<string, unknown>,
): Promise<void> {
  await patchEntity('continuityTakeData', id, changes);
}

// ---- As quatro coleções de estado do set ----

/**
 * As quatro têm a mesma forma, então têm as mesmas funções.
 *
 * Escrever `listProps`, `listWardrobe`, `listHairMakeup` e `listSetDressing` idênticas
 * seria garantir que uma delas um dia esqueça o filtro de `deletedAt` — e essa é a que
 * ninguém testa.
 */
export type ColecaoDeEstado =
  | 'continuityProp'
  | 'continuityWardrobe'
  | 'continuityHairMakeup'
  | 'continuitySetDressing';

type LinhaDeEstado =
  | LocalContinuityProp
  | LocalContinuityWardrobe
  | LocalContinuityHairMakeup
  | LocalContinuitySetDressing;

export interface EscopoDeEstado {
  sceneId?: string | null;
  setupId?: string | null;
  takeId?: string | null;
}

function tabelaDaColecao(colecao: ColecaoDeEstado) {
  const db = getDb();
  const tabelas = {
    continuityProp: db.continuityProps,
    continuityWardrobe: db.continuityWardrobe,
    continuityHairMakeup: db.continuityHairMakeup,
    continuitySetDressing: db.continuitySetDressing,
  } as const;
  return tabelas[colecao];
}

/**
 * Todos os itens de uma coleção presos a qualquer um dos escopos informados.
 *
 * Consulta por escopo, e não a coleção inteira filtrada em memória: a tela pergunta isto a
 * cada cena aberta, e a diferença aparece na produção grande, que é justamente onde a
 * continuidade tem mais itens.
 */
export async function listEstado(
  colecao: ColecaoDeEstado,
  escopo: { sceneIds?: string[]; setupIds?: string[]; takeIds?: string[] },
): Promise<LinhaDeEstado[]> {
  const tabela = tabelaDaColecao(colecao) as unknown as {
    where: (indice: string) => {
      anyOf: (valores: string[]) => { toArray: () => Promise<LinhaDeEstado[]> };
    };
  };

  const por = (indice: string, valores?: string[]) =>
    valores?.length ? tabela.where(indice).anyOf(valores).toArray() : null;

  const consultas = [
    por('sceneId', escopo.sceneIds),
    por('setupId', escopo.setupIds),
    por('takeId', escopo.takeIds),
  ].filter((consulta) => consulta !== null);

  if (consultas.length === 0) return [];

  const resultados = await Promise.all(consultas);

  // Um item preso a cena **e** take apareceria duas vezes: a união é por id.
  const porId = new Map<string, LinhaDeEstado>();
  for (const linha of resultados.flat()) {
    if (!linha.deletedAt) porId.set(linha.id, linha);
  }

  return [...porId.values()];
}

/**
 * Cria um item de estado com id derivado de **escopo + nome**.
 *
 * A chave natural aqui é "que objeto, preso a quê": duas pessoas anotando "Copo" na cena
 * 24, cada uma sem rede, convergem para o mesmo registro em vez de criarem dois copos
 * (ADR-019). O nome entra normalizado porque "Copo" e "copo " são o mesmo objeto para
 * quem está em set, e ids diferentes seriam duas linhas no relatório.
 */
export async function createEstado(
  colecao: ColecaoDeEstado,
  input: EscopoDeEstado & {
    productionId: string;
    /** `name`, `character` ou `element`, conforme a coleção. */
    chave: string;
    campos?: Record<string, unknown>;
  },
): Promise<string> {
  const id = deriveId(
    colecao,
    input.sceneId ?? '',
    input.setupId ?? '',
    input.takeId ?? '',
    input.chave.trim().toLowerCase(),
  );

  return createEntity(colecao as SyncEntityType, id, {
    ...(input.campos ?? {}),
    id,
    productionId: input.productionId,
    sceneId: input.sceneId ?? null,
    setupId: input.setupId ?? null,
    takeId: input.takeId ?? null,
    version: 0,
    _dirty: 1,
  } as unknown as LinhaDeEstado & Record<string, unknown>);
}

export async function patchEstado(
  colecao: ColecaoDeEstado,
  id: string,
  changes: Record<string, unknown>,
): Promise<void> {
  await patchEntity(colecao as SyncEntityType, id, changes);
}

export async function removeEstado(colecao: ColecaoDeEstado, id: string): Promise<void> {
  await softDelete(colecao as SyncEntityType, id);
}

// ---- Relatório de Progresso da Diária ----

/** Id derivado da diária: o balanço é um só, e duas pessoas abrem o mesmo (ADR-034). */
export const dailyProgressReportId = (shootingDayId: string) =>
  deriveId('dailyProgressReport', shootingDayId);

export async function getDailyProgressReport(
  shootingDayId: string,
): Promise<LocalDailyProgressReport | undefined> {
  const linha = await getDb().dailyProgressReport.get(
    dailyProgressReportId(shootingDayId),
  );
  return linha?.deletedAt ? undefined : linha;
}

export async function ensureDailyProgressReport(input: {
  productionId: string;
  shootingDayId: string;
}): Promise<string> {
  const id = dailyProgressReportId(input.shootingDayId);

  const existente = await getDb().dailyProgressReport.get(id);
  if (existente && !existente.deletedAt) return id;

  return createEntity('dailyProgressReport', id, {
    id,
    productionId: input.productionId,
    shootingDayId: input.shootingDayId,
    version: 0,
    _dirty: 1,
  } as unknown as LocalDailyProgressReport & Record<string, unknown>);
}

export async function patchDailyProgressReport(
  id: string,
  changes: Record<string, unknown>,
): Promise<void> {
  await patchEntity('dailyProgressReport', id, changes);
}
