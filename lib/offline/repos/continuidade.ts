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
  type LocalContinuityNote,
  type LocalContinuityPhoto,
  type LocalDailyProgressReport,
  type LocalPhotoBlob,
} from '../db';
import { uid } from '@/utils/id';

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

// ---- Notas de raccord (ADR-042) ----

/**
 * Notas de raccord presas a qualquer um dos escopos — cena, plano ou take.
 *
 * Mesmo desenho de `listEstado` (consulta por índice de escopo, união por id), mas sem
 * passar por ele: a nota não é uma "coleção de estado" com chave natural, e misturá-la
 * no tipo `ColecaoDeEstado` faria `createEstado` aceitar criá-la com id derivado — que é
 * exatamente o que apagaria a segunda nota de "olhar" da mesma cena.
 */
export async function listNotas(escopo: {
  sceneIds?: string[];
  setupIds?: string[];
  takeIds?: string[];
}): Promise<LocalContinuityNote[]> {
  return porEscopo<LocalContinuityNote>(getDb().continuityNotes, escopo);
}

/** Id **aleatório**: duas notas iguais são duas observações, não a mesma (ADR-042). */
export async function createNota(
  input: EscopoDeEstado & {
    productionId: string;
    category: string | null;
    note: string;
  },
): Promise<string> {
  const id = uid();
  return createEntity('continuityNote', id, {
    id,
    productionId: input.productionId,
    sceneId: input.sceneId ?? null,
    setupId: input.setupId ?? null,
    takeId: input.takeId ?? null,
    category: input.category,
    note: input.note,
    version: 0,
    _dirty: 1,
  } as unknown as LocalContinuityNote & Record<string, unknown>);
}

export async function patchNota(id: string, changes: Record<string, unknown>) {
  await patchEntity('continuityNote', id, changes);
}

export async function removeNota(id: string): Promise<void> {
  await softDelete('continuityNote', id);
}

// ---- Fotografias (ADR-042) ----

export async function listFotos(escopo: {
  sceneIds?: string[];
  setupIds?: string[];
  takeIds?: string[];
}): Promise<LocalContinuityPhoto[]> {
  const fotos = await porEscopo<LocalContinuityPhoto>(getDb().continuityPhotos, escopo);
  return fotos.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/**
 * Guarda uma foto: o **registro** (que sincroniza) e os **bytes** (que ficam aqui até
 * subir), numa transação só.
 *
 * Separados, haveria a janela em que o registro existe sem bytes no próprio aparelho que
 * tirou a foto — a equipe veria "foto ainda não enviada" para sempre, porque não sobrou
 * ninguém com os bytes para enviar.
 */
export async function salvaFoto(
  input: EscopoDeEstado & {
    productionId: string;
    category: string | null;
    caption?: string | null;
    mimeType: string;
    bytes: ArrayBuffer;
    width: number;
    height: number;
  },
): Promise<string> {
  const db = getDb();
  const id = uid();

  await db.transaction(
    'rw',
    [db.continuityPhotos, db.outbox, db.photoBlobs],
    async () => {
      await createEntity('continuityPhoto', id, {
        id,
        productionId: input.productionId,
        sceneId: input.sceneId ?? null,
        setupId: input.setupId ?? null,
        takeId: input.takeId ?? null,
        category: input.category,
        caption: input.caption ?? null,
        mimeType: input.mimeType,
        width: input.width,
        height: input.height,
        sizeBytes: input.bytes.byteLength,
        version: 0,
        _dirty: 1,
      } as unknown as LocalContinuityPhoto & Record<string, unknown>);

      await db.photoBlobs.put({
        id,
        productionId: input.productionId,
        mimeType: input.mimeType,
        bytes: input.bytes,
        uploaded: 0,
        attempts: 0,
      });
    },
  );

  return id;
}

export async function patchFoto(id: string, changes: Record<string, unknown>) {
  await patchEntity('continuityPhoto', id, changes);
}

/**
 * Apagar uma foto é exclusão lógica do **registro**.
 *
 * Os bytes locais só saem quando o servidor já os tem: se o apagamento virar conflito e
 * alguém restaurar a foto, um aparelho que nunca a enviou ainda precisa dos bytes para
 * enviá-la. Os que já subiram podem sair — descem de novo se a foto voltar.
 */
export async function removeFoto(id: string): Promise<void> {
  await softDelete('continuityPhoto', id);
  const blob = await getDb().photoBlobs.get(id);
  if (blob?.uploaded) await getDb().photoBlobs.delete(id);
}

/** Os bytes de uma foto neste aparelho, ou `undefined` se ainda não desceram. */
export async function getFotoBlob(id: string): Promise<LocalPhotoBlob | undefined> {
  return getDb().photoBlobs.get(id);
}

/** Os bytes de várias fotos de uma vez — os que não estão no aparelho ficam de fora. */
export async function getFotoBlobs(ids: string[]): Promise<LocalPhotoBlob[]> {
  if (ids.length === 0) return [];
  const blobs = await getDb().photoBlobs.bulkGet(ids);
  return blobs.filter((blob): blob is LocalPhotoBlob => blob !== undefined);
}

/** Quantas fotos deste aparelho ainda não subiram — o aviso antes de desfixar a diária. */
export async function fotosPendentes(productionId: string): Promise<number> {
  return getDb()
    .photoBlobs.where('[productionId+uploaded]')
    .equals([productionId, 0])
    .count();
}

// ---- comum ----

type TabelaComEscopo<T> = {
  where: (indice: string) => {
    anyOf: (valores: string[]) => { toArray: () => Promise<T[]> };
  };
};

async function porEscopo<T extends { id: string; deletedAt?: string | null }>(
  tabela: unknown,
  escopo: { sceneIds?: string[]; setupIds?: string[]; takeIds?: string[] },
): Promise<T[]> {
  const t = tabela as TabelaComEscopo<T>;
  const por = (indice: string, valores?: string[]) =>
    valores?.length ? t.where(indice).anyOf(valores).toArray() : null;

  const consultas = [
    por('sceneId', escopo.sceneIds),
    por('setupId', escopo.setupIds),
    por('takeId', escopo.takeIds),
  ].filter((consulta) => consulta !== null);

  if (consultas.length === 0) return [];

  const porId = new Map<string, T>();
  for (const linha of (await Promise.all(consultas)).flat()) {
    if (!linha.deletedAt) porId.set(linha.id, linha);
  }
  return [...porId.values()];
}
