'use client';

/**
 * Banco local da superfície de diária (ADR-003, ADR-016).
 *
 * **Só o que está dentro da fronteira mora aqui.** Produção, membros, auth e relatórios
 * são Next.js comum lendo Drizzle no servidor — se algum dia aparecer uma tabela de
 * produção neste arquivo, a fronteira foi rompida.
 *
 * Dexie e não IndexedDB cru pelo que o IndexedDB cru não dá: upgrade versionado de
 * schema, transação declarativa e `liveQuery` — reatividade que já funciona entre abas.
 * Errar no banco local significa perder o boletim de um dia de filmagem, e isso não é
 * lugar para economizar.
 */

import Dexie, { type Table } from 'dexie';

import type { SyncEntityType } from '@/lib/contracts/sync';

/** O que toda entidade sincronizável carrega, além dos próprios campos. */
export interface LocalRecord {
  id: string;
  productionId: string;
  /** Versão do servidor. `0` enquanto o registro só existe aqui. */
  version: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
  deletedAt?: string | null;
  /** `1` quando há mudança local ainda não confirmada pelo servidor. */
  _dirty: 0 | 1;
}

export interface LocalShootingDay extends LocalRecord {
  date: string;
  dayNumber?: string | null;
  unit?: string | null;
  location?: string | null;
  callTime?: string | null;
  wrapTime?: string | null;
  notes?: string | null;
}

export interface LocalScene extends LocalRecord {
  number: string;
  block?: string | null;
  page?: string | null;
  storyDay?: string | null;
  intExt?: string | null;
  dayNight?: string | null;
  location?: string | null;
  description?: string | null;
}

export interface LocalSetup extends LocalRecord {
  sceneId: string;
  shootingDayId: string;
  code: string;
  name?: string | null;
  /** Tipo de captação: Normal, Série, Insert, Pickup, Drone — o `Plano.tipo` do boletim. */
  kind?: string | null;
  shotSize?: string | null;
  angle?: string | null;
  movement?: string | null;
  screenDirection?: string | null;
  eyeline?: string | null;
  description?: string | null;
  sortOrder: number;
}

export interface LocalTake extends LocalRecord {
  setupId: string;
  number: number;
  /** Julgamento: o take presta? (ADR-010) */
  status: string;
  /** Natureza: sync, MOS, wild, playback… Do take compartilhado (ADR-029). */
  kind?: string | null;
  durationSec?: number | null;
  notes?: string | null;
}

export interface LocalCameraUnit extends LocalRecord {
  label: string;
  model?: string | null;
  bodySerial?: string | null;
  operator?: string | null;
  focusPuller?: string | null;
  clapper?: string | null;
}

/** Uma linha por câmera por take — técnica e óptica moram aqui (ADR-011). */
export interface LocalCameraTakeData extends LocalRecord {
  takeId: string;
  cameraUnitId?: string | null;
  status?: string | null;
  /** Motivo do NG. "NG" sem motivo é anotação inútil na pós (ADR-029). */
  ngReason?: string | null;
  approved: boolean;
  card?: string | null;
  roll?: string | null;
  volume?: string | null;
  fileName?: string | null;
  mediaNotes?: string | null;
  lens?: string | null;
  focalLength?: string | null;
  tStop?: string | null;
  filter?: string | null;
  matteBox?: boolean | null;
  iso?: string | null;
  fps?: string | null;
  shutter?: string | null;
  whiteBalance?: string | null;
  resolution?: string | null;
  codec?: string | null;
  aspectRatio?: string | null;
  lut?: string | null;
  colorSpace?: string | null;
  vfx?: string | null;
  notes?: string | null;
}

/** Configuração de som da diária — uma por `ShootingDay`. */
export interface LocalSoundDayConfig extends LocalRecord {
  shootingDayId: string;
  sampleRate?: string | null;
  bitDepth?: string | null;
  frameRate?: string | null;
  timecodeSource?: string | null;
  tcJamAt?: string | null;
  userBits?: string | null;
  dropFrame?: boolean | null;
  fileFormat?: string | null;
  poly?: boolean | null;
  media?: string | null;
  roll?: string | null;
  mediaCopies?: string | null;
  mediaVerified?: boolean | null;
  soundMixer?: string | null;
  boomOperator?: string | null;
}

/** Uma linha por take — o som não é multicam. */
export interface LocalSoundTakeData extends LocalRecord {
  takeId: string;
  status?: string | null;
  ngReason?: string | null;
  circled: boolean;
  soundRoll?: string | null;
  fileName?: string | null;
  tcStart?: string | null;
  tcEnd?: string | null;
  durationSec?: number | null;
  notes?: string | null;
}

/** Um registro por canal — sem o limite de quatro do caderno de papel. */
export interface LocalSoundTakeTrack extends LocalRecord {
  takeId: string;
  index: number;
  name?: string | null;
  source?: string | null;
  equipmentId?: string | null;
  notes?: string | null;
}

/** Continuidade de ação — uma linha por take. Tudo texto livre, de propósito. */
export interface LocalContinuityTakeData extends LocalRecord {
  takeId: string;
  status?: string | null;
  ngReason?: string | null;
  /** O "circled" da continuísta. */
  selected: boolean;
  durationSec?: number | null;
  startPosition?: string | null;
  endPosition?: string | null;
  action?: string | null;
  movement?: string | null;
  direction?: string | null;
  entrancesExits?: string | null;
  eyeline?: string | null;
  objectInteraction?: string | null;
  characterInteraction?: string | null;
  dialogueChanges?: string | null;
  improvisation?: string | null;
  scriptDeviation?: string | null;
  notes?: string | null;
}

/**
 * O escopo flexível das quatro coleções de estado: cena, setup **ou** take.
 *
 * Um figurino vale para a cena inteira; um copo pela metade vale para um take. Forçar
 * tudo ao mesmo nível obrigaria a repetir o figurino em cada take, ou a perder a precisão
 * do copo.
 */
export interface LocalContinuityScope extends LocalRecord {
  sceneId?: string | null;
  setupId?: string | null;
  takeId?: string | null;
  notes?: string | null;
}

export interface LocalContinuityProp extends LocalContinuityScope {
  name?: string | null;
  position?: string | null;
  state?: string | null;
  quantity?: string | null;
  interaction?: string | null;
}

export interface LocalContinuityWardrobe extends LocalContinuityScope {
  character?: string | null;
  outfit?: string | null;
  accessories?: string | null;
  state?: string | null;
}

export interface LocalContinuityHairMakeup extends LocalContinuityScope {
  character?: string | null;
  state?: string | null;
  changes?: string | null;
}

export interface LocalContinuitySetDressing extends LocalContinuityScope {
  element?: string | null;
  position?: string | null;
  state?: string | null;
}

/** Relatório de Progresso da Diária — só o que exige mão humana (ADR-034). */
export interface LocalDailyProgressReport extends LocalRecord {
  shootingDayId: string;
  firstTakeAt?: string | null;
  pagesShot?: string | null;
  estimatedMinutes?: string | null;
  scenesCovered?: string | null;
  scenesPartial?: string | null;
  scenesSkipped?: string | null;
  scenesAdded?: string | null;
  notes?: string | null;
  signedBy?: string | null;
}

export type OutboxStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';

export interface OutboxEntry {
  id: string;
  productionId: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  /** Delta com os dois valores — ADR-018. */
  fields: Record<string, { de: unknown; para: unknown }>;
  createdAt: string;
  attempts: number;
  status: OutboxStatus;
  /** Motivo do último erro. `FAILED` **nunca** descarta o payload. */
  error?: string;
  /** Momento (epoch ms) antes do qual não se tenta de novo — backoff com jitter. */
  retryAfter?: number;
}

export interface SyncConflict {
  id: string;
  productionId: string;
  entityType: SyncEntityType;
  entityId: string;
  field: string;
  meuValor: unknown;
  valorRemoto: unknown;
  remotoPor: string | null;
  remotoEm: string | null;
  detectadoEm: string;
  status: 'PENDING' | 'RESOLVED';
  resolucao?: 'MEU' | 'REMOTO';
  resolvidoEm?: string;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

/**
 * `refs` guarda o que vem do snapshot só para leitura — membros, hoje. Não sincroniza e
 * não entra na outbox: se estiver velho, o pior que acontece é um nome desatualizado ao
 * lado de um conflito.
 */
export interface RefEntry {
  key: string;
  value: unknown;
}

class PlatformDatabase extends Dexie {
  shootingDays!: Table<LocalShootingDay, string>;
  scenes!: Table<LocalScene, string>;
  setups!: Table<LocalSetup, string>;
  takes!: Table<LocalTake, string>;
  cameraUnits!: Table<LocalCameraUnit, string>;
  cameraTakeData!: Table<LocalCameraTakeData, string>;
  soundDayConfig!: Table<LocalSoundDayConfig, string>;
  soundTakeData!: Table<LocalSoundTakeData, string>;
  soundTakeTracks!: Table<LocalSoundTakeTrack, string>;
  continuityTakeData!: Table<LocalContinuityTakeData, string>;
  continuityProps!: Table<LocalContinuityProp, string>;
  continuityWardrobe!: Table<LocalContinuityWardrobe, string>;
  continuityHairMakeup!: Table<LocalContinuityHairMakeup, string>;
  continuitySetDressing!: Table<LocalContinuitySetDressing, string>;
  dailyProgressReport!: Table<LocalDailyProgressReport, string>;
  outbox!: Table<OutboxEntry, string>;
  syncConflicts!: Table<SyncConflict, string>;
  meta!: Table<MetaEntry, string>;
  refs!: Table<RefEntry, string>;

  constructor() {
    super('bdc-platform');

    this.version(1).stores({
      shootingDays: 'id, productionId, date',
      scenes: 'id, productionId, [number+block]',
      setups: 'id, productionId, sceneId, shootingDayId, [shootingDayId+sortOrder]',
      takes: 'id, productionId, setupId, [setupId+number]',
      outbox:
        'id, productionId, status, createdAt, [productionId+status], [entityType+entityId]',
      syncConflicts:
        'id, productionId, status, [entityType+entityId+field], [productionId+status]',
      meta: 'key',
      refs: 'key',
    });

    // Versão 2: o módulo de Câmera (Fase 5). Upgrade versionado é a razão de o banco
    // local ser Dexie e não IndexedDB cru — tabela nova não obriga ninguém a reinstalar.
    this.version(2).stores({
      cameraUnits: 'id, productionId, label',
      cameraTakeData: 'id, productionId, takeId, [takeId+cameraUnitId]',
    });

    // Versão 3: o módulo de Som (Fase 6). Mesma razão da versão 2 — tabela nova não
    // obriga ninguém a reinstalar, e quem estiver com diária fixada não perde nada.
    this.version(3).stores({
      soundDayConfig: 'id, productionId, shootingDayId',
      soundTakeData: 'id, productionId, takeId',
      soundTakeTracks: 'id, productionId, takeId, [takeId+index]',
    });

    // Versão 4: o módulo de Continuidade (Fase 7). As quatro coleções de estado são
    // indexadas pelos **três** níveis de escopo, e não só por um: a tela pergunta "o que
    // vale para esta cena", "o que mudou neste setup" e "o que é deste take" o tempo
    // todo, e sem os três índices cada pergunta viraria varredura da coleção inteira.
    this.version(4).stores({
      continuityTakeData: 'id, productionId, takeId',
      continuityProps: 'id, productionId, sceneId, setupId, takeId',
      continuityWardrobe: 'id, productionId, sceneId, setupId, takeId',
      continuityHairMakeup: 'id, productionId, sceneId, setupId, takeId',
      continuitySetDressing: 'id, productionId, sceneId, setupId, takeId',
      dailyProgressReport: 'id, productionId, shootingDayId',
    });
  }
}

/**
 * Entidade sincronizável → tabela do Dexie.
 *
 * Existe aqui, e num lugar só, porque o repositório e o motor de sync precisavam da mesma
 * tradução e a mantinham cada um por sua conta. Duas cópias significavam que acrescentar
 * um departamento era editar dois mapas — e esquecer o segundo dá um sintoma cruel: o
 * dado grava localmente, entra na fila, e o pull nunca o aplica de volta.
 */
export function tableFor(entityType: SyncEntityType): Table<AnyLocalRecord, string> {
  const db = getDb();
  const tables = {
    scene: db.scenes,
    setup: db.setups,
    take: db.takes,
    cameraUnit: db.cameraUnits,
    cameraTakeData: db.cameraTakeData,
    soundDayConfig: db.soundDayConfig,
    soundTakeData: db.soundTakeData,
    soundTakeTrack: db.soundTakeTracks,
    continuityTakeData: db.continuityTakeData,
    continuityProp: db.continuityProps,
    continuityWardrobe: db.continuityWardrobe,
    continuityHairMakeup: db.continuityHairMakeup,
    continuitySetDressing: db.continuitySetDressing,
    dailyProgressReport: db.dailyProgressReport,
  } as const;

  return tables[entityType] as unknown as Table<AnyLocalRecord, string>;
}

export type AnyLocalRecord = LocalRecord & Record<string, unknown>;

/**
 * Instância única, criada só no navegador.
 *
 * Módulo com `'use client'` ainda é importado durante o render de servidor; construir o
 * Dexie ali quebraria o build. O acesso é sempre por `getDb()`.
 */
let instance: PlatformDatabase | null = null;

export function getDb(): PlatformDatabase {
  if (typeof indexedDB === 'undefined') {
    throw new Error('O banco local só existe no navegador.');
  }
  instance ??= new PlatformDatabase();
  return instance;
}

// ---- meta ----

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await getDb().meta.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await getDb().meta.put({ key, value });
}

/** Cursor do pull, por produção. */
export const cursorKey = (productionId: string) => `cursor:${productionId}`;

/** Diárias fixadas. Fixar é o que autoriza a diária a existir sem rede. */
export const PINS_KEY = 'pins';
