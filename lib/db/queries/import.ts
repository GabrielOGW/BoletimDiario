/**
 * Importação dos boletins locais para a plataforma (ADR-023, ADR-032).
 *
 * Duas escolhas governam este arquivo.
 *
 * **O cliente manda o boletim cru, não o modelo mapeado.** O que chega aqui é o conteúdo
 * de `bdc:boletins:v1` como veio do `LocalStorage` — e a primeira coisa que acontece é
 * `normalizeBoletim()`, que já é uma coerção defensiva sem `any` capaz de transformar
 * _qualquer_ JSON num `Boletim` válido. Confiar no payload seria abrir uma porta de
 * escrita direta nas tabelas; mapear no servidor fecha essa porta e ainda garante que a
 * importação use exatamente o mapeador testado, e não uma cópia que o navegador rodou.
 *
 * **Nada é sobrescrito.** Toda inserção é `on conflict do nothing`. Importar de novo
 * preenche o que falta e não encosta no que alguém já digitou — é isso que substitui a
 * maquinaria de reversibilidade que a rodada 1 previa (local-to-cloud.md §5).
 */

import 'server-only';

import { eq, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

import { groupBoletins, mapGroupToSnapshot } from '@/domain/platform/from-boletim';
import type { ProductionSnapshot } from '@/domain/platform/types';
import type { Department } from '@/domain/platform/enums';
import { db } from '@/lib/db/client';
import {
  cameraTakeData,
  cameraUnits,
  productionMembers,
  productions,
  scenes,
  setups,
  shootingDays,
  takes,
} from '@/lib/db/schema';
import { normalizeBoletim } from '@/lib/normalize';
import { deriveJoinCode } from '@/domain/platform/derive-id';
import { uid } from '@/utils/id';

export interface ImportCounts {
  shootingDays: number;
  cameraUnits: number;
  scenes: number;
  setups: number;
  takes: number;
  cameraTakeData: number;
}

export type ImportResult =
  | {
      status: 'OK';
      productionId: string;
      productionName: string;
      /** `false` quando a produção já existia — reimportação. */
      criada: boolean;
      inseridos: ImportCounts;
    }
  | { status: 'VAZIO' }
  | { status: 'NAO_E_DONO'; productionId: string };

/**
 * Importa um grupo de boletins como **uma** produção da qual quem importa é `OWNER`.
 *
 * O agrupamento é o mesmo do mapeador (`slug(título) + slug(produtora)`), então mandar
 * boletins de projetos diferentes numa chamada só importaria o primeiro grupo e ignoraria
 * os demais — quem chama manda um grupo por vez.
 */
export async function importBoletins(input: {
  /** O conteúdo bruto de `bdc:boletins:v1`. Passa por `normalizeBoletim` aqui. */
  boletins: unknown;
  userId: string;
  userName: string;
  department: Department;
  now?: string;
}): Promise<ImportResult> {
  const brutos = Array.isArray(input.boletins) ? input.boletins : [];
  const normalizados = brutos.map((bruto) => normalizeBoletim(bruto));

  const grupos = groupBoletins(normalizados);
  if (grupos.length === 0) return { status: 'VAZIO' };

  const snapshot = mapGroupToSnapshot(grupos[0], {
    actorId: input.userId,
    now: input.now ?? new Date().toISOString(),
  });

  const existente = await produçãoExistente(snapshot.production.id);

  // A produção já existe e é de outra pessoa: só pode acontecer por colisão do id
  // derivado, que agora inclui quem importa. Recusar é a única resposta segura —
  // escrever ali seria despejar boletins na sala de um desconhecido.
  if (existente && existente.ownerId !== input.userId) {
    return { status: 'NAO_E_DONO', productionId: snapshot.production.id };
  }

  if (!existente) {
    await criaProducao(snapshot, input);
  }

  const inseridos = await insereConteudo(snapshot, input.userId);

  return {
    status: 'OK',
    productionId: snapshot.production.id,
    productionName: snapshot.production.name,
    criada: !existente,
    inseridos,
  };
}

async function produçãoExistente(
  productionId: string,
): Promise<{ ownerId: string | null } | null> {
  const [linha] = await db
    .select({ id: productions.id, createdBy: productions.createdBy })
    .from(productions)
    .where(eq(productions.id, productionId))
    .limit(1);

  return linha ? { ownerId: linha.createdBy } : null;
}

/**
 * Cria a produção e o vínculo de dono na **mesma** requisição.
 *
 * `db.batch` e não `db.transaction` pelo mesmo motivo de `createProduction`: o driver
 * HTTP do Neon não tem transação interativa. Uma produção sem dono seria invisível para
 * quem a importou e impossível de administrar.
 */
async function criaProducao(
  snapshot: ProductionSnapshot,
  input: { userId: string; userName: string; department: Department },
): Promise<void> {
  const { production } = snapshot;

  // O código do mapeador é determinístico; o do banco é único global. Sortear aqui evita
  // que dois projetos de mesmo nome briguem por um código.
  const joinCode = await codigoLivre(production.name);

  await db.batch([
    db
      .insert(productions)
      .values({
        id: production.id,
        name: production.name,
        company: production.company || null,
        director: production.director || null,
        dop: production.dop || null,
        joinCode,
        createdBy: input.userId,
        updatedBy: input.userId,
      })
      .onConflictDoNothing(),
    db
      .insert(productionMembers)
      .values({
        id: uid(),
        productionId: production.id,
        userId: input.userId,
        role: 'OWNER',
        department: input.department,
        displayName: input.userName,
        createdBy: input.userId,
        updatedBy: input.userId,
      })
      .onConflictDoNothing(),
  ]);
}

async function codigoLivre(nome: string): Promise<string> {
  for (let tentativa = 0; tentativa < 8; tentativa += 1) {
    const candidato = deriveJoinCode(nome, uid());
    const [ocupado] = await db
      .select({ id: productions.id })
      .from(productions)
      .where(eq(productions.joinCode, candidato))
      .limit(1);

    if (!ocupado) return candidato;
  }

  throw new Error('Não foi possível gerar um código de convite livre.');
}

/**
 * Insere o conteúdo na ordem das dependências.
 *
 * Diária e câmera antes de setup e de dados de câmera, porque as chaves estrangeiras
 * apontam para lá. Cada nível espera o anterior: um `setup` que chegasse antes da sua
 * cena seria recusado pelo banco, e o boletim entraria pela metade.
 */
async function insereConteudo(
  snapshot: ProductionSnapshot,
  userId: string,
): Promise<ImportCounts> {
  const productionId = snapshot.production.id;
  const auditoria = { createdBy: userId, updatedBy: userId };

  const dias = await insereEmLotes(
    shootingDays,
    snapshot.shootingDays.map((dia) => ({
      id: dia.id,
      productionId,
      date: dia.date,
      dayNumber: dia.dayNumber || null,
      unit: dia.unit || null,
      location: dia.location || null,
      callTime: dia.callTime || null,
      wrapTime: dia.wrapTime || null,
      lunchStart: dia.lunchStart || null,
      lunchEnd: dia.lunchEnd || null,
      notes: dia.notes || null,
      ...auditoria,
    })),
  );

  const cameras = await insereEmLotes(
    cameraUnits,
    snapshot.cameraUnits.map((camera) => ({
      id: camera.id,
      productionId,
      label: camera.label,
      model: camera.model || null,
      bodySerial: camera.bodySerial || null,
      operator: camera.operator || null,
      focusPuller: camera.focusPuller || null,
      clapper: camera.clapper || null,
      ...auditoria,
    })),
  );

  const cenas = await insereEmLotes(
    scenes,
    snapshot.scenes.map((cena) => ({
      id: cena.id,
      productionId,
      number: cena.number,
      block: cena.block || null,
      location: cena.location || null,
      description: cena.description || null,
      ...auditoria,
    })),
  );

  const planos = await insereEmLotes(
    setups,
    snapshot.setups.map((setup) => ({
      id: setup.id,
      productionId,
      sceneId: setup.sceneId,
      shootingDayId: setup.shootingDayId || null,
      code: setup.code,
      name: setup.name || null,
      kind: setup.kind || null,
      description: setup.description || null,
      sortOrder: setup.sortOrder ?? 0,
      ...auditoria,
    })),
  );

  const tomadas = await insereEmLotes(
    takes,
    snapshot.takes.map((take) => ({
      id: take.id,
      productionId,
      setupId: take.setupId,
      number: take.number,
      status: take.status,
      notes: take.notes || null,
      ...auditoria,
    })),
  );

  const dadosCamera = await insereEmLotes(
    cameraTakeData,
    snapshot.cameraTakeData.map(({ config, ...dados }) => ({
      id: dados.id,
      productionId,
      takeId: dados.takeId,
      cameraUnitId: dados.cameraUnitId || null,
      status: dados.status ?? null,
      approved: dados.approved,
      card: dados.card || null,
      roll: dados.roll || null,
      volume: dados.volume || null,
      fileName: dados.fileName || null,
      mediaNotes: dados.mediaNotes || null,
      lens: config.lens || null,
      focalLength: config.focalLength || null,
      tStop: config.tStop || null,
      filter: config.filter || null,
      matteBox: config.matteBox || null,
      iso: config.iso || null,
      fps: config.fps || null,
      shutter: config.shutter || null,
      whiteBalance: config.whiteBalance || null,
      resolution: config.resolution || null,
      // `recordingFormat` não tem coluna própria: no boletim atual `formatoGravacao`
      // recebe os dois valores misturados e o mapeador já o entrega em `codec`. Aqui
      // ele só serve de reserva para não perder o texto se um dia vier separado.
      codec: config.codec || config.recordingFormat || null,
      aspectRatio: config.aspectRatio || null,
      lut: config.lut || null,
      colorSpace: config.colorSpace || null,
      vfx: config.vfx || null,
      notes: dados.notes || null,
      ...auditoria,
    })),
  );

  return {
    shootingDays: dias,
    cameraUnits: cameras,
    scenes: cenas,
    setups: planos,
    takes: tomadas,
    cameraTakeData: dadosCamera,
  };
}

/** Uma diária grande passa de mil takes; um `insert` só com tudo estoura o payload. */
const LOTE = 200;

/**
 * Insere em lotes e devolve **quantas linhas entraram de fato**.
 *
 * O `returning` é o que separa "importei 40 takes" de "40 takes já estavam lá": com
 * `on conflict do nothing`, a linha que já existia simplesmente não volta. É o relatório
 * honesto que a tela mostra depois.
 */
async function insereEmLotes<T extends PgTable>(
  tabela: T,
  linhas: T['$inferInsert'][],
): Promise<number> {
  let inseridas = 0;

  for (let inicio = 0; inicio < linhas.length; inicio += LOTE) {
    const devolvidas = await db
      .insert(tabela)
      .values(linhas.slice(inicio, inicio + LOTE))
      .onConflictDoNothing()
      .returning({ id: sql<string>`id` });

    inseridas += devolvidas.length;
  }

  return inseridas;
}
