/**
 * Criação de entidades e REGRAS DE SET da plataforma.
 *
 * Este arquivo é o equivalente de `lib/factory.ts` no modelo novo, com uma adição
 * importante: as automações que o briefing pede nos §29 e §30 (herança entre takes,
 * incremento automático, reset de take ao trocar de setup) vivem AQUI, como regra de
 * domínio pura e testada — não espalhadas em handlers de UI.
 *
 * O motivo é prático: as três telas (Câmera, Som, Continuidade) precisam do mesmo
 * comportamento, e é ele que faz a diferença entre "preencher em dois toques" e
 * "redigitar tudo a cada take" — o que decide se a ferramenta é usada em set.
 *
 * Puro: sem I/O, sem React, sem dependências externas.
 */

import type {
  Audited,
  CalendarDate,
  CameraConfig,
  CameraTakeData,
  CameraUnit,
  ContinuityTakeData,
  EntityId,
  Equipment,
  EquipmentAssignment,
  Production,
  ProductionMember,
  ProductionSnapshot,
  Scene,
  Setup,
  ShootingDay,
  SoundDayConfig,
  SoundTakeData,
  SoundTakeTrack,
  SoundTrackTemplate,
  Take,
  Timestamp,
} from '@/domain/platform/types';
import { DEFAULT_TAKE_KIND } from '@/domain/platform/enums';
import type { Department, EquipmentCategory, MemberRole } from '@/domain/platform/enums';
import { incrementSuffix } from '@/utils/sequence';
import { uid } from '@/utils/id';

/** Contexto de criação. `now` é injetável para tornar os testes determinísticos. */
export interface CreateContext {
  actorId?: EntityId | null;
  now?: Timestamp;
}

function stamp(ctx: CreateContext): Timestamp {
  return ctx.now ?? new Date().toISOString();
}

/** Campos de auditoria de uma entidade recém-criada (§21). */
export function audit(ctx: CreateContext = {}): Audited {
  const now = stamp(ctx);
  const actor = ctx.actorId ?? null;
  return {
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    updatedBy: actor,
    deletedAt: null,
    deletedBy: null,
    version: 1,
  };
}

/** Carimba uma alteração. Note que `version` é incrementada pelo SERVIDOR, não aqui. */
export function touch<T extends Audited>(entity: T, ctx: CreateContext = {}): T {
  return { ...entity, updatedAt: stamp(ctx), updatedBy: ctx.actorId ?? entity.updatedBy };
}

/** Soft delete — um delete físico não tem como ser propagado pelo sync (ADR-015). */
export function softDelete<T extends Audited>(entity: T, ctx: CreateContext = {}): T {
  return { ...entity, deletedAt: stamp(ctx), deletedBy: ctx.actorId ?? null };
}

export function isDeleted(entity: Audited): boolean {
  return entity.deletedAt !== null;
}

// ============================================================
// Configuração de câmera
// ============================================================

export function emptyCameraConfig(): CameraConfig {
  return {
    lens: '',
    focalLength: '',
    tStop: '',
    filter: '',
    matteBox: false,
    iso: '',
    fps: '',
    shutter: '',
    whiteBalance: '',
    resolution: '',
    recordingFormat: '',
    codec: '',
    aspectRatio: '',
    lut: '',
    colorSpace: '',
    vfx: '',
  };
}

// ============================================================
// Produção e sala
// ============================================================

/** Alfabeto sem caracteres ambíguos (0/O, 1/I) — o código é ditado em voz alta em set. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomChunk(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/** `"Filme X"` → `"FILMEX-8K2P"`. A parte aleatória é o que garante a unicidade. */
export function generateJoinCode(productionName: string, suffixLength = 4): string {
  const prefix =
    productionName
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 6) || 'SALA';
  return `${prefix}-${randomChunk(suffixLength)}`;
}

export interface CreateProductionInput {
  id?: EntityId;
  name?: string;
  company?: string;
  director?: string;
  dop?: string;
  joinCode?: string;
  isProvisional?: boolean;
}

export function createProduction(
  input: CreateProductionInput = {},
  ctx: CreateContext = {},
): Production {
  const name = input.name ?? '';
  return {
    id: input.id ?? uid('prod'),
    name,
    company: input.company ?? '',
    director: input.director ?? '',
    dop: input.dop ?? '',
    joinCode: input.joinCode ?? generateJoinCode(name),
    joinEnabled: true,
    archivedAt: null,
    isProvisional: input.isProvisional ?? false,
    ...audit(ctx),
  };
}

export interface CreateMemberInput {
  id?: EntityId;
  productionId: EntityId;
  userId?: EntityId | null;
  role?: MemberRole;
  department: Department;
  displayName?: string;
  jobTitle?: string;
}

export function createProductionMember(
  input: CreateMemberInput,
  ctx: CreateContext = {},
): ProductionMember {
  return {
    id: input.id ?? uid('member'),
    productionId: input.productionId,
    userId: input.userId ?? null,
    role: input.role ?? 'MEMBER',
    department: input.department,
    extraDepartments: [],
    displayName: input.displayName ?? '',
    jobTitle: input.jobTitle ?? '',
    lastSeenAt: null,
    ...audit(ctx),
  };
}

export interface CreateShootingDayInput {
  id?: EntityId;
  productionId: EntityId;
  date: CalendarDate;
  dayNumber?: string;
  unit?: string;
}

export function createShootingDay(
  input: CreateShootingDayInput,
  ctx: CreateContext = {},
): ShootingDay {
  return {
    id: input.id ?? uid('day'),
    productionId: input.productionId,
    date: input.date,
    dayNumber: input.dayNumber ?? '',
    unit: input.unit ?? '',
    location: '',
    callTime: '',
    wrapTime: '',
    lunchStart: '',
    lunchEnd: '',
    notes: '',
    ...audit(ctx),
  };
}

// ============================================================
// Scene → Setup → Take
// ============================================================

export interface CreateSceneInput {
  id?: EntityId;
  productionId: EntityId;
  number?: string;
  block?: string;
  sortOrder?: number;
}

export function createScene(input: CreateSceneInput, ctx: CreateContext = {}): Scene {
  return {
    id: input.id ?? uid('scene'),
    productionId: input.productionId,
    number: input.number ?? '',
    block: input.block ?? '',
    page: '',
    storyDay: '',
    intExt: null,
    dayNight: null,
    location: '',
    description: '',
    characters: [],
    sortOrder: input.sortOrder ?? 0,
    ...audit(ctx),
  };
}

/** Rótulo lido na claquete: `"24"` + `"B"` → `"24B"`. */
export function sceneLabel(scene: Pick<Scene, 'number' | 'block'>): string {
  return `${scene.number}${scene.block}`.trim();
}

export interface CreateSetupInput {
  id?: EntityId;
  productionId: EntityId;
  sceneId: EntityId;
  shootingDayId?: EntityId | null;
  code?: string;
  name?: string;
  kind?: string;
  sortOrder?: number;
  cameraDefaults?: CameraConfig;
}

export function createSetup(input: CreateSetupInput, ctx: CreateContext = {}): Setup {
  return {
    id: input.id ?? uid('setup'),
    productionId: input.productionId,
    sceneId: input.sceneId,
    shootingDayId: input.shootingDayId ?? null,
    code: input.code ?? '',
    name: input.name ?? '',
    kind: input.kind ?? 'Normal',
    shotSize: '',
    angle: '',
    movement: '',
    screenDirection: '',
    eyeline: '',
    description: '',
    sortOrder: input.sortOrder ?? 0,
    cameraDefaults: input.cameraDefaults ?? emptyCameraConfig(),
    ...audit(ctx),
  };
}

/** `"24B / C"` — usado no cabeçalho de contexto dos três módulos. */
export function setupLabel(
  scene: Pick<Scene, 'number' | 'block'>,
  setup: Pick<Setup, 'code'>,
): string {
  const label = sceneLabel(scene);
  return setup.code ? `${label} / ${setup.code}` : label;
}

/**
 * Próximo número de take de um setup.
 *
 * §30: como recebe apenas os takes DO SETUP, trocar de setup (24B → 24C) devolve 1
 * automaticamente — o reset não precisa de código especial, é consequência do escopo.
 */
export function nextTakeNumber(takesOfSetup: readonly Pick<Take, 'number'>[]): number {
  let highest = 0;
  for (const take of takesOfSetup) {
    if (take.number > highest) highest = take.number;
  }
  return highest + 1;
}

export interface CreateTakeInput {
  id?: EntityId;
  productionId: EntityId;
  setupId: EntityId;
  number: number;
}

export function createTake(input: CreateTakeInput, ctx: CreateContext = {}): Take {
  return {
    id: input.id ?? uid('take'),
    productionId: input.productionId,
    setupId: input.setupId,
    number: input.number,
    status: 'RECORDED',
    // `SYNC` por padrão, e é decisão de UX antes de ser de modelo: ninguém em set escolhe
    // "sync" a cada tomada. A natureza só é tocada quando o take foge do normal (ADR-029).
    kind: DEFAULT_TAKE_KIND,
    durationSec: null,
    startedAt: null,
    notes: '',
    ...audit(ctx),
  };
}

/** Cria o próximo take de um setup a partir dos takes que já existem nele. */
export function createNextTake(
  productionId: EntityId,
  setupId: EntityId,
  takesOfSetup: readonly Pick<Take, 'number'>[],
  ctx: CreateContext = {},
): Take {
  return createTake({ productionId, setupId, number: nextTakeNumber(takesOfSetup) }, ctx);
}

// ============================================================
// Dados de câmera
// ============================================================

export function createCameraUnit(
  input: { id?: EntityId; productionId: EntityId; label?: string },
  ctx: CreateContext = {},
): CameraUnit {
  return {
    id: input.id ?? uid('cam'),
    productionId: input.productionId,
    label: input.label ?? '',
    model: '',
    bodySerial: '',
    equipmentId: null,
    operator: '',
    focusPuller: '',
    clapper: '',
    ...audit(ctx),
  };
}

export interface CreateCameraTakeDataInput {
  id?: EntityId;
  productionId: EntityId;
  takeId: EntityId;
  cameraUnitId?: EntityId | null;
  cameraLabel?: string;
  config?: CameraConfig;
}

export function createCameraTakeData(
  input: CreateCameraTakeDataInput,
  ctx: CreateContext = {},
): CameraTakeData {
  return {
    id: input.id ?? uid('camtake'),
    productionId: input.productionId,
    takeId: input.takeId,
    cameraUnitId: input.cameraUnitId ?? null,
    cameraLabel: input.cameraLabel ?? '',
    status: null,
    ngReason: '',
    approved: false,
    card: '',
    roll: '',
    volume: '',
    fileName: '',
    mediaNotes: '',
    config: input.config ? { ...input.config } : emptyCameraConfig(),
    notes: '',
    ...audit(ctx),
  };
}

/**
 * §29 — o novo take "nasce preenchido".
 *
 * Herda câmera, cartão, roll, volume e TODA a configuração técnica do take anterior, e
 * auto-incrementa o sufixo numérico do nome do arquivo (`A012C005_001` → `A012C005_002`),
 * exatamente como `utils/sequence.ts` já faz hoje no Clip/Sync.
 *
 * O que NÃO é herdado é tão importante quanto o que é: `approved`, `status` e as notas
 * voltam ao zero — herdar a aprovação do take anterior seria registrar informação falsa.
 *
 * §30 — como o cartão vem do take anterior, trocar o cartão uma vez faz o novo valor
 * persistir para todos os takes seguintes, sem nenhum estado global.
 */
export function inheritCameraTakeData(
  previous: CameraTakeData,
  takeId: EntityId,
  ctx: CreateContext = {},
): CameraTakeData {
  const base = createCameraTakeData(
    {
      productionId: previous.productionId,
      takeId,
      cameraUnitId: previous.cameraUnitId,
      cameraLabel: previous.cameraLabel,
      config: previous.config,
    },
    ctx,
  );
  return {
    ...base,
    card: previous.card,
    roll: previous.roll,
    volume: previous.volume,
    fileName: incrementSuffix(previous.fileName),
  };
}

// ============================================================
// Dados de som
// ============================================================

export function createSoundDayConfig(
  input: { id?: EntityId; productionId: EntityId; shootingDayId: EntityId },
  ctx: CreateContext = {},
): SoundDayConfig {
  return {
    id: input.id ?? uid('sndcfg'),
    productionId: input.productionId,
    shootingDayId: input.shootingDayId,
    sampleRate: '',
    bitDepth: '',
    frameRate: '',
    timecodeSource: '',
    dropFrame: false,
    fileFormat: '',
    poly: true,
    media: '',
    roll: '',
    soundMixer: '',
    boomOperator: '',
    tcJamAt: null,
    userBits: '',
    mediaCopies: '',
    mediaVerified: false,
    trackTemplate: [],
    ...audit(ctx),
  };
}

export function createSoundTakeData(
  input: { id?: EntityId; productionId: EntityId; takeId: EntityId },
  ctx: CreateContext = {},
): SoundTakeData {
  return {
    id: input.id ?? uid('sndtake'),
    productionId: input.productionId,
    takeId: input.takeId,
    status: null,
    circled: false,
    soundRoll: '',
    fileName: '',
    tcStart: '',
    tcEnd: '',
    durationSec: null,
    ngReason: '',
    notes: '',
    ...audit(ctx),
  };
}

/**
 * §29/§30 para o som: herda o sound roll e incrementa o arquivo.
 * Timecode, duração, flags e notas NÃO são herdados — são específicos da tomada.
 */
export function inheritSoundTakeData(
  previous: SoundTakeData,
  takeId: EntityId,
  ctx: CreateContext = {},
): SoundTakeData {
  const base = createSoundTakeData({ productionId: previous.productionId, takeId }, ctx);
  return {
    ...base,
    soundRoll: previous.soundRoll,
    fileName: incrementSuffix(previous.fileName),
  };
}

export function createSoundTakeTrack(
  input: {
    id?: EntityId;
    productionId: EntityId;
    takeId: EntityId;
    index: number;
    name?: string;
    source?: string;
    equipmentId?: EntityId | null;
  },
  ctx: CreateContext = {},
): SoundTakeTrack {
  return {
    id: input.id ?? uid('track'),
    productionId: input.productionId,
    takeId: input.takeId,
    index: input.index,
    name: input.name ?? '',
    source: input.source ?? '',
    equipmentId: input.equipmentId ?? null,
    notes: '',
    ...audit(ctx),
  };
}

/**
 * Materializa as tracks de um take a partir do layout da diária.
 * É isto que evita redigitar quatro tracks a cada take — o ponto em que o módulo de
 * som ganha ou perde o usuário.
 */
export function tracksFromTemplate(
  template: readonly SoundTrackTemplate[],
  productionId: EntityId,
  takeId: EntityId,
  ctx: CreateContext = {},
): SoundTakeTrack[] {
  return template.map((entry) =>
    createSoundTakeTrack(
      {
        productionId,
        takeId,
        index: entry.index,
        name: entry.name,
        source: entry.source,
        equipmentId: entry.equipmentId,
      },
      ctx,
    ),
  );
}

// ============================================================
// Dados de continuidade
// ============================================================

export function createContinuityTakeData(
  input: { id?: EntityId; productionId: EntityId; takeId: EntityId },
  ctx: CreateContext = {},
): ContinuityTakeData {
  return {
    id: input.id ?? uid('conttake'),
    productionId: input.productionId,
    takeId: input.takeId,
    status: null,
    selected: false,
    durationSec: null,
    startPosition: '',
    endPosition: '',
    action: '',
    movement: '',
    direction: '',
    entrancesExits: '',
    eyeline: '',
    objectInteraction: '',
    characterInteraction: '',
    dialogueChanges: '',
    improvisation: '',
    scriptDeviation: '',
    notes: '',
    ...audit(ctx),
  };
}

// ============================================================
// Equipamentos e fotos
// ============================================================

export function createEquipment(
  input: {
    id?: EntityId;
    productionId: EntityId;
    department: Department;
    category: EquipmentCategory;
    model?: string;
    nickname?: string;
    quantity?: string;
  },
  ctx: CreateContext = {},
): Equipment {
  return {
    id: input.id ?? uid('equip'),
    productionId: input.productionId,
    department: input.department,
    category: input.category,
    manufacturer: '',
    model: input.model ?? '',
    serialNumber: '',
    nickname: input.nickname ?? '',
    quantity: input.quantity ?? '',
    notes: '',
    ...audit(ctx),
  };
}

export function createEquipmentAssignment(
  input: {
    id?: EntityId;
    productionId: EntityId;
    equipmentId: EntityId;
    department: Department;
    shootingDayId?: EntityId | null;
    memberId?: EntityId | null;
    label?: string;
  },
  ctx: CreateContext = {},
): EquipmentAssignment {
  return {
    id: input.id ?? uid('assign'),
    productionId: input.productionId,
    equipmentId: input.equipmentId,
    shootingDayId: input.shootingDayId ?? null,
    memberId: input.memberId ?? null,
    department: input.department,
    label: input.label ?? '',
    notes: '',
    ...audit(ctx),
  };
}

// Não há `createPhoto`: fotografias foram removidas do modelo por ADR-022.

// ============================================================
// Agregado
// ============================================================

export function createEmptySnapshot(production: Production): ProductionSnapshot {
  return {
    production,
    members: [],
    shootingDays: [],
    cameraUnits: [],
    scenes: [],
    setups: [],
    takes: [],
    cameraTakeData: [],
    soundDayConfigs: [],
    soundTakeData: [],
    soundTakeTracks: [],
    continuityTakeData: [],
    continuityProps: [],
    continuityWardrobe: [],
    continuityHairMakeup: [],
    continuitySetDressing: [],
    equipment: [],
    equipmentAssignments: [],
  };
}

// ============================================================
// Herança sobre o formato plano do armazenamento
// ============================================================

/**
 * O que **não** se herda de um take para o seguinte.
 *
 * Esta lista é a regra inteira, e o que está fora dela importa tanto quanto o que está
 * dentro: herdar `approved` registraria uma aprovação que o diretor não deu, e herdar as
 * notas repetiria "avião no take" num take em que não passou avião.
 *
 * Tudo o mais — câmera, cartão, roll, volume, lente, T-stop, ISO, FPS, LUT — **é**
 * herdado, e é isso que faz o take novo nascer preenchido (§29). Campo técnico novo
 * passa a ser herdado sozinho, sem ninguém lembrar de vir aqui.
 */
export const CAMERA_TAKE_RESET_FIELDS = [
  'status',
  'approved',
  'notes',
  'mediaNotes',
  'deletedAt',
] as const;

/**
 * Herança entre takes sobre o formato **plano** do armazenamento.
 *
 * `inheritCameraTakeData` opera sobre a entidade do modelo de referência, com `config`
 * aninhado; o banco e o Dexie guardam os campos planos. Esta é a mesma regra na forma que
 * o armazenamento usa — e continua sendo regra de domínio, testada, e não um handler de
 * componente.
 *
 * §30 sai de graça: como o cartão vem do take anterior, trocá-lo uma vez faz o valor novo
 * persistir para todos os seguintes, sem nenhum estado global.
 */
export function inheritCameraFlat(
  previous: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(previous)) {
    if ((CAMERA_TAKE_RESET_FIELDS as readonly string[]).includes(key)) continue;
    if (key === 'id' || key === 'takeId' || key === 'version' || key === '_dirty')
      continue;
    if (key === 'updatedAt' || key === 'updatedBy' || key === 'createdAt') continue;
    next[key] = value;
  }

  next.approved = false;
  next.status = null;
  next.fileName = incrementSuffix(String(previous.fileName ?? ''));

  return next;
}
