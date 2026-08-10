/**
 * Mapeamento `Boletim` (schema v2) → modelo da plataforma.
 *
 * Este é o coração da migração dos dados que JÁ EXISTEM nos dispositivos dos usuários
 * (§40). Ele roda sobre a saída de `normalizeBoletim()`, então só precisa lidar com um
 * formato de entrada — a normalização já converteu qualquer boletim v1 em v2.
 *
 *     LocalStorage → normalizeBoletim() → [este arquivo] → banco local → Neon
 *
 * Duas propriedades são obrigatórias e testadas:
 *
 *  1. IDEMPOTÊNCIA — todos os ids são derivados deterministicamente (ver derive-id.ts),
 *     então mapear duas vezes produz exatamente o mesmo resultado. Uma migração
 *     interrompida pode ser refeita sem duplicar nada.
 *
 *  2. NADA SE PERDE — quando um valor não cabe no campo de destino (número de take não
 *     numérico, código de setup repetido), ele é preservado em outro lugar em vez de
 *     descartado.
 *
 * Puro: sem I/O. Ver docs/migrations/local-to-cloud.md.
 */

import type { Bloco, Boletim, Cena, Plano } from '@/types/boletim';
import type {
  CameraConfig,
  CameraTakeData,
  CameraUnit,
  EntityId,
  Equipment,
  EquipmentAssignment,
  ProductionMember,
  ProductionSnapshot,
  Scene,
  Setup,
  ShootingDay,
  Take,
} from '@/domain/platform/types';
import {
  createCameraTakeData,
  createCameraUnit,
  createEmptySnapshot,
  createEquipment,
  createEquipmentAssignment,
  createProduction,
  createProductionMember,
  createScene,
  createSetup,
  createShootingDay,
  createTake,
  emptyCameraConfig,
} from '@/domain/platform/factory';
import type { CreateContext } from '@/domain/platform/factory';
import { deriveId, deriveJoinCode } from '@/domain/platform/derive-id';
import { slugify } from '@/utils/boletim-stats';

// ============================================================
// Agrupamento: N boletins → 1 produção
// ============================================================

/** Um `Boletim` é uma diária. Várias diárias do mesmo projeto formam uma produção. */
export interface BoletimGroup {
  /** Chave estável de agrupamento (título + produtora). */
  key: string;
  name: string;
  company: string;
  boletins: Boletim[];
}

const UNTITLED = 'Boletins sem título';

function groupKeyOf(boletim: Boletim): string {
  const titulo = slugify(boletim.producao.tituloProjeto);
  const produtora = slugify(boletim.producao.produtora);
  return `${titulo}|${produtora}`;
}

/**
 * Agrupa boletins por título + produtora, preservando a ordem de primeiro aparecimento.
 * O agrupamento automático é um palpite — por isso a migração mostra o resultado ao
 * usuário antes de aplicar (etapa 3 de docs/migrations/local-to-cloud.md).
 */
export function groupBoletins(boletins: readonly Boletim[]): BoletimGroup[] {
  const groups = new Map<string, BoletimGroup>();

  for (const boletim of boletins) {
    const key = groupKeyOf(boletim);
    const existing = groups.get(key);
    if (existing) {
      existing.boletins.push(boletim);
      continue;
    }
    groups.set(key, {
      key,
      name: boletim.producao.tituloProjeto.trim() || UNTITLED,
      company: boletim.producao.produtora.trim(),
      boletins: [boletim],
    });
  }

  // Diárias em ordem cronológica — deixa a numeração de unidade estável.
  for (const group of groups.values()) {
    group.boletins.sort(
      (a, b) =>
        a.producao.data.localeCompare(b.producao.data) ||
        a.createdAt.localeCompare(b.createdAt),
    );
  }

  return [...groups.values()];
}

// ============================================================
// Utilitários de coerção
// ============================================================

/** `"3"` → `3`. Qualquer outra coisa → `null` (o texto original é preservado à parte). */
function parseTakeNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Menor inteiro ≥ `from` ainda não usado. */
function firstFree(used: ReadonlySet<number>, from: number): number {
  let candidate = Math.max(1, from);
  while (used.has(candidate)) candidate += 1;
  return candidate;
}

/** Garante unicidade de código dentro de um escopo, sufixando `-2`, `-3`… */
function uniqueCode(used: Set<string>, preferred: string, fallback: string): string {
  const base = preferred.trim() || fallback;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  const code = `${base}-${suffix}`;
  used.add(code);
  return code;
}

function joinNotes(...parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Configuração técnica do `Plano` v2 → `CameraConfig`.
 *
 * `formatoGravacao` vai para `codec`: na prática é isso que o campo recebe hoje
 * ("ProRes 422 HQ", "R3D"). `recordingFormat` fica livre para o uso correto daqui
 * em diante — ver docs/features/camera.md §3.
 */
export function cameraConfigFromPlano(plano: Plano): CameraConfig {
  return {
    ...emptyCameraConfig(),
    lens: plano.optica.lentes,
    filter: plano.optica.filtros,
    matteBox: plano.optica.matteBox,
    tStop: plano.tecnica.diafragma,
    iso: plano.tecnica.iso,
    fps: plano.tecnica.frameRate,
    shutter: plano.tecnica.obturador,
    whiteBalance: plano.tecnica.balancoBranco,
    resolution: plano.tecnica.resolucao,
    codec: plano.tecnica.formatoGravacao,
    lut: plano.tecnica.lutPerfil,
    colorSpace: plano.tecnica.espacoCor,
  };
}

// ============================================================
// Mapeamento
// ============================================================

export interface MapOptions extends CreateContext {
  /** Marca a produção como local (ainda não sincronizada). Padrão: `true`. */
  provisional?: boolean;
}

interface DayContext {
  boletim: Boletim;
  day: ShootingDay;
  /** `Plano.cameraId` (v2) → id da `CameraUnit` (plataforma). */
  cameraUnitByLegacyId: Map<string, EntityId>;
}

/**
 * Converte um grupo de boletins em UMA produção completa.
 *
 * Chamado por `mapBoletinsToProductions`; exposto para permitir migrar um grupo
 * isoladamente depois de o usuário reagrupar na tela de confirmação.
 */
export function mapGroupToSnapshot(
  group: BoletimGroup,
  options: MapOptions = {},
): ProductionSnapshot {
  const ctx: CreateContext = { actorId: options.actorId, now: options.now };
  const first = group.boletins[0];

  const productionId = deriveId('production', group.key);
  const production = createProduction(
    {
      id: productionId,
      name: group.name,
      company: group.company,
      director: first?.producao.diretor ?? '',
      dop: first?.producao.diretorFotografia ?? '',
      joinCode: deriveJoinCode(group.name, group.key),
      isProvisional: options.provisional ?? true,
    },
    ctx,
  );

  const snapshot = createEmptySnapshot(production);

  // Cenas são da PRODUÇÃO (podem atravessar diárias): deduplicadas por número+bloco,
  // exatamente como o `unique (production_id, number, block)` do banco.
  const sceneByLabel = new Map<string, Scene>();
  // Membros e equipamentos também são da produção: deduplicados por chave natural.
  const memberByKey = new Map<string, ProductionMember>();
  const equipmentByKey = new Map<string, Equipment>();
  // Unidades de câmera, deduplicadas pelo rótulo ("A", "B").
  const cameraUnitByLabel = new Map<string, CameraUnit>();
  // Datas já usadas — duas diárias no mesmo dia viram unidades diferentes.
  const unitByDate = new Map<string, number>();

  for (const boletim of group.boletins) {
    const dayCtx = mapShootingDay(boletim, snapshot, {
      productionId,
      ctx,
      unitByDate,
      cameraUnitByLabel,
    });

    mapScenesOfBoletim(boletim, snapshot, { productionId, ctx, sceneByLabel, dayCtx });
    mapTeam(boletim, snapshot, { productionId, ctx, memberByKey });
    mapMedia(boletim, snapshot, { productionId, ctx, equipmentByKey, dayCtx });
  }

  return snapshot;
}

interface DayDeps {
  productionId: EntityId;
  ctx: CreateContext;
  unitByDate: Map<string, number>;
  cameraUnitByLabel: Map<string, CameraUnit>;
}

function mapShootingDay(
  boletim: Boletim,
  snapshot: ProductionSnapshot,
  deps: DayDeps,
): DayContext {
  const { productionId, ctx } = deps;
  const date = boletim.producao.data;

  // Duas diárias na mesma data (segunda unidade, splinter) coexistem via `unit`.
  const seen = (deps.unitByDate.get(date) ?? 0) + 1;
  deps.unitByDate.set(date, seen);
  const unit = seen > 1 ? String(seen) : '';

  const day: ShootingDay = {
    ...createShootingDay(
      {
        id: deriveId('shootingDay', boletim.id),
        productionId,
        date,
        dayNumber: boletim.producao.diaDiaria,
        unit,
      },
      ctx,
    ),
    callTime: boletim.horarios.inicio,
    wrapTime: boletim.horarios.fim,
    lunchStart: boletim.horarios.almocoInicio,
    lunchEnd: boletim.horarios.almocoFim,
    // `cenasDoDia` não é migrado: os números são recalculáveis a partir dos takes.
    // Só `continuidade`, que é texto genuinamente livre, é preservado.
    notes: joinNotes(boletim.observacoesGerais, boletim.cenasDoDia.continuidade),
    // A auditoria original é preservada — a diária é anterior a este mapeamento.
    createdAt: boletim.createdAt,
    updatedAt: boletim.updatedAt,
  };
  snapshot.shootingDays.push(day);

  // Câmeras cadastradas → unidades de câmera da produção.
  const cameraUnitByLegacyId = new Map<string, EntityId>();
  for (const legacy of boletim.camerasCadastradas) {
    const label = legacy.nomeId.trim();
    const key = label || legacy.id;
    let unitEntity = deps.cameraUnitByLabel.get(key);
    if (!unitEntity) {
      unitEntity = {
        ...createCameraUnit(
          { id: deriveId('cameraUnit', productionId, key), productionId, label },
          ctx,
        ),
        model: legacy.modelo,
        operator: legacy.operador,
        focusPuller: legacy.foco,
        clapper: legacy.claquetista,
      };
      deps.cameraUnitByLabel.set(key, unitEntity);
      snapshot.cameraUnits.push(unitEntity);
    }
    cameraUnitByLegacyId.set(legacy.id, unitEntity.id);
  }

  return { boletim, day, cameraUnitByLegacyId };
}

interface SceneDeps {
  productionId: EntityId;
  ctx: CreateContext;
  sceneByLabel: Map<string, Scene>;
  dayCtx: DayContext;
}

function mapScenesOfBoletim(
  boletim: Boletim,
  snapshot: ProductionSnapshot,
  deps: SceneDeps,
): void {
  boletim.cenas.forEach((cena, cenaIndex) => {
    cena.blocos.forEach((bloco, blocoIndex) => {
      const scene = resolveScene(
        cena,
        bloco,
        cenaIndex * 100 + blocoIndex,
        deps,
        snapshot,
      );
      mapSetupsOfBloco(bloco, scene, deps, snapshot);
    });
  });
}

/**
 * `Cena.numero` + `Bloco.letra` → uma `Scene` (ADR-002).
 * A mesma cena aparecendo em duas diárias resolve para a MESMA entidade.
 */
function resolveScene(
  cena: Cena,
  bloco: Bloco,
  sortOrder: number,
  deps: SceneDeps,
  snapshot: ProductionSnapshot,
): Scene {
  const number = cena.numero.trim();
  const block = bloco.letra.trim();
  const label = `${number}|${block}`;

  const existing = deps.sceneByLabel.get(label);
  if (existing) return existing;

  const scene = createScene(
    {
      id: deriveId('scene', deps.productionId, number, block),
      productionId: deps.productionId,
      number,
      block,
      sortOrder,
    },
    deps.ctx,
  );
  deps.sceneByLabel.set(label, scene);
  snapshot.scenes.push(scene);
  return scene;
}

function mapSetupsOfBloco(
  bloco: Bloco,
  scene: Scene,
  deps: SceneDeps,
  snapshot: ProductionSnapshot,
): void {
  // Escopo de unicidade do código do setup: cena + diária (ver database.md).
  const usedCodes = new Set<string>();

  bloco.planos.forEach((plano, index) => {
    const config = cameraConfigFromPlano(plano);
    const setup: Setup = {
      ...createSetup(
        {
          // Derivado do id do PLANO: dois planos com o mesmo número continuam sendo
          // dois setups distintos — nada se perde.
          id: deriveId('setup', plano.id),
          productionId: deps.productionId,
          sceneId: scene.id,
          shootingDayId: deps.dayCtx.day.id,
          code: uniqueCode(usedCodes, plano.numero, String(index + 1)),
          kind: plano.tipo,
          sortOrder: index,
          cameraDefaults: config,
        },
        deps.ctx,
      ),
      description: plano.observacoes,
    };
    snapshot.setups.push(setup);

    mapTakesOfPlano(plano, setup, config, deps, snapshot);
  });
}

function mapTakesOfPlano(
  plano: Plano,
  setup: Setup,
  config: CameraConfig,
  deps: SceneDeps,
  snapshot: ProductionSnapshot,
): void {
  const usedNumbers = new Set<number>();
  const cameraUnitId = deps.dayCtx.cameraUnitByLegacyId.get(plano.cameraId) ?? null;

  plano.takes.forEach((legacyTake, index) => {
    const parsed = parseTakeNumber(legacyTake.numero);
    const number =
      parsed !== null && !usedNumbers.has(parsed)
        ? parsed
        : firstFree(usedNumbers, index + 1);
    usedNumbers.add(number);

    // O rótulo original só vira nota quando não coube no inteiro — nada se perde.
    const original = legacyTake.numero.trim();
    const numberNote =
      original && original !== String(number) ? `Take original: "${original}"` : '';

    const take: Take = {
      ...createTake(
        {
          id: deriveId('take', legacyTake.id),
          productionId: deps.productionId,
          setupId: setup.id,
          number,
        },
        deps.ctx,
      ),
      // `aprovado` do v2 significa "aprovado pelo diretor" → CIRCLE (ADR-010).
      status: legacyTake.aprovado ? 'CIRCLE' : 'RECORDED',
      notes: numberNote,
    };
    snapshot.takes.push(take);

    const cameraData: CameraTakeData = {
      ...createCameraTakeData(
        {
          id: deriveId('cameraTakeData', legacyTake.id),
          productionId: deps.productionId,
          takeId: take.id,
          cameraUnitId,
          cameraLabel: plano.cameraNome,
          config,
        },
        deps.ctx,
      ),
      status: legacyTake.aprovado ? 'CIRCLE' : 'RECORDED',
      // O booleano é preservado ALÉM do status: perder a semântica original de
      // "aprovado pelo diretor" seria regressão.
      approved: legacyTake.aprovado,
      card: legacyTake.cartao,
      fileName: legacyTake.clipSync,
      notes: legacyTake.notaOperacional,
    };
    snapshot.cameraTakeData.push(cameraData);
  });
}

interface TeamDeps {
  productionId: EntityId;
  ctx: CreateContext;
  memberByKey: Map<string, ProductionMember>;
}

/**
 * `equipeCamera[]` → membros PROVISÓRIOS (sem `userId`).
 * Eles existem para o boletim continuar nominando a equipe; viram membros de verdade
 * quando a pessoa entrar na sala com uma conta.
 */
function mapTeam(boletim: Boletim, snapshot: ProductionSnapshot, deps: TeamDeps): void {
  for (const membro of boletim.equipeCamera) {
    const name = membro.nome.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (deps.memberByKey.has(key)) continue;

    const member = createProductionMember(
      {
        id: deriveId('member', deps.productionId, key),
        productionId: deps.productionId,
        department: 'CAMERA',
        displayName: name,
        jobTitle: membro.funcao,
      },
      deps.ctx,
    );
    deps.memberByKey.set(key, member);
    snapshot.members.push(member);
  }
}

interface MediaDeps {
  productionId: EntityId;
  ctx: CreateContext;
  equipmentByKey: Map<string, Equipment>;
  dayCtx: DayContext;
}

/** `midiaSuporte[]` → equipamento da produção + atribuição na diária (§22/§23). */
function mapMedia(boletim: Boletim, snapshot: ProductionSnapshot, deps: MediaDeps): void {
  for (const midia of boletim.midiaSuporte) {
    const label = midia.numeroCartao.trim();
    const tipo = midia.tipoMidia.trim();
    if (!label && !tipo) continue;

    const key = `${tipo.toLowerCase()}|${label.toLowerCase()}`;
    let item = deps.equipmentByKey.get(key);
    if (!item) {
      item = {
        ...createEquipment(
          {
            id: deriveId('equipment', deps.productionId, key),
            productionId: deps.productionId,
            department: 'CAMERA',
            category: 'MEDIA',
            model: tipo,
            nickname: label,
            quantity: midia.quantidade,
          },
          deps.ctx,
        ),
        notes: midia.responsavel.trim() ? `Responsável: ${midia.responsavel}` : '',
      };
      deps.equipmentByKey.set(key, item);
      snapshot.equipment.push(item);
    }

    const assignment: EquipmentAssignment = createEquipmentAssignment(
      {
        id: deriveId('equipmentAssignment', deps.dayCtx.day.id, key),
        productionId: deps.productionId,
        equipmentId: item.id,
        department: 'CAMERA',
        shootingDayId: deps.dayCtx.day.id,
        label,
      },
      deps.ctx,
    );
    snapshot.equipmentAssignments.push(assignment);
  }
}

// ============================================================
// API pública
// ============================================================

/** Converte todos os boletins locais em produções, agrupando por título + produtora. */
export function mapBoletinsToProductions(
  boletins: readonly Boletim[],
  options: MapOptions = {},
): ProductionSnapshot[] {
  return groupBoletins(boletins).map((group) => mapGroupToSnapshot(group, options));
}

/** Conveniência: um único boletim vira uma produção com uma diária. */
export function mapBoletimToProduction(
  boletim: Boletim,
  options: MapOptions = {},
): ProductionSnapshot {
  return mapGroupToSnapshot(
    {
      key: groupKeyOf(boletim),
      name: boletim.producao.tituloProjeto.trim() || UNTITLED,
      company: boletim.producao.produtora.trim(),
      boletins: [boletim],
    },
    options,
  );
}

/** Contagens usadas na tela de confirmação e na verificação pós-migração (etapa 6). */
export interface SnapshotCounts {
  shootingDays: number;
  scenes: number;
  setups: number;
  takes: number;
  approvedTakes: number;
  cameraUnits: number;
}

export function countSnapshot(snapshot: ProductionSnapshot): SnapshotCounts {
  return {
    shootingDays: snapshot.shootingDays.length,
    scenes: snapshot.scenes.length,
    setups: snapshot.setups.length,
    takes: snapshot.takes.length,
    approvedTakes: snapshot.cameraTakeData.filter((data) => data.approved).length,
    cameraUnits: snapshot.cameraUnits.length,
  };
}

/** Contagens equivalentes lidas direto dos boletins — o outro lado da verificação. */
export function countBoletins(boletins: readonly Boletim[]): SnapshotCounts {
  const scenes = new Set<string>();
  const cameras = new Set<string>();
  let setups = 0;
  let takes = 0;
  let approvedTakes = 0;

  for (const boletim of boletins) {
    for (const cam of boletim.camerasCadastradas) {
      cameras.add(cam.nomeId.trim() || cam.id);
    }
    for (const cena of boletim.cenas) {
      for (const bloco of cena.blocos) {
        scenes.add(`${cena.numero.trim()}|${bloco.letra.trim()}`);
        setups += bloco.planos.length;
        for (const plano of bloco.planos) {
          takes += plano.takes.length;
          approvedTakes += plano.takes.filter((take) => take.aprovado).length;
        }
      }
    }
  }

  return {
    shootingDays: boletins.length,
    scenes: scenes.size,
    setups,
    takes,
    approvedTakes,
    cameraUnits: cameras.size,
  };
}
