/**
 * Modelo de domínio compartilhado do Boletim Audiovisual.
 *
 * Este é o contrato único entre os três módulos (Câmera, Som, Continuidade),
 * o banco local (IndexedDB) e o banco remoto (Postgres). Ele é PURO:
 * não importa React, Dexie, Drizzle nem nada com I/O.
 *
 * PRINCÍPIO CENTRAL — a unidade de produção é compartilhada:
 *
 *     Scene → Setup → Take
 *                      ├── CameraTakeData      (1 por câmera — multicam)
 *                      ├── SoundTakeData       (1 por take)
 *                      └── ContinuityTakeData  (1 por take)
 *
 * Nenhum departamento cria a sua própria cena ou o seu próprio take: todos
 * anexam dados ao MESMO Take. Ver docs/architecture/overview.md.
 */

import type {
  DayNight,
  Department,
  EquipmentCategory,
  IntExt,
  MemberRole,
  PhotoSubject,
  SyncOperationKind,
  SyncStatus,
  TakeStatus,
} from '@/domain/platform/enums';

/**
 * Identificador de entidade. Gerado NO CLIENTE (UUID), porque criar registro
 * offline exige id definitivo no ato — id temporário remapeado na sincronização
 * é a fonte clássica de referência quebrada. Ver ADR-012.
 */
export type EntityId = string;

/** Timestamp ISO-8601 em UTC (`2026-08-10T14:32:10.000Z`). */
export type Timestamp = string;

/** Data civil `YYYY-MM-DD`. Uma diária é um dia, não um instante. */
export type CalendarDate = string;

/** Hora local `HH:mm`. */
export type ClockTime = string;

/**
 * Campos de auditoria e concorrência presentes em TODA entidade de domínio (§21).
 * `version` é o que permite detectar conflito na sincronização.
 */
export interface Audited {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: EntityId | null;
  updatedBy: EntityId | null;
  /** Soft delete: um delete físico não tem como ser propagado pelo sync (ADR-015). */
  deletedAt: Timestamp | null;
  deletedBy: EntityId | null;
  version: number;
}

// ============================================================
// Produção e sala
// ============================================================

/**
 * Uma produção. A "Sala" é a projeção colaborativa desta entidade — não existe
 * tabela `rooms` separada (ADR-001).
 */
export interface Production extends Audited {
  id: EntityId;
  name: string;
  company: string;
  director: string;
  dop: string;
  /** Código curto de convite, ex.: `FILMEX-8K2P`. */
  joinCode: string;
  joinEnabled: boolean;
  archivedAt: Timestamp | null;
  /** `true` enquanto a produção só existe neste dispositivo (nunca sincronizada). */
  isProvisional: boolean;
}

/**
 * Vínculo entre usuário e produção.
 *
 * `role` (o que pode fazer) e `department` (sobre quais dados trabalha) são eixos
 * INDEPENDENTES e nunca devem ser combinados num campo só (§5).
 */
export interface ProductionMember extends Audited {
  id: EntityId;
  productionId: EntityId;
  /** `null` em membro provisório — migrado de `equipeCamera`, ainda sem conta. */
  userId: EntityId | null;
  role: MemberRole;
  department: Department;
  /** Departamentos adicionais (DIT que também é 2º AC, por exemplo). */
  extraDepartments: Department[];
  displayName: string;
  jobTitle: string;
  lastSeenAt: Timestamp | null;
}

/** Uma diária. */
export interface ShootingDay extends Audited {
  id: EntityId;
  productionId: EntityId;
  date: CalendarDate;
  /** Texto, não número: existem diárias "12A" e "12B". */
  dayNumber: string;
  /** Unidade (1ª, 2ª, splinter). Usada também para desempatar duas diárias no mesmo dia. */
  unit: string;
  location: string;
  callTime: ClockTime;
  wrapTime: ClockTime;
  lunchStart: ClockTime;
  lunchEnd: ClockTime;
  notes: string;
}

// ============================================================
// Unidade compartilhada: Scene → Setup → Take
// ============================================================

/**
 * Cena. `number` + `block` formam o identificador lido na claquete: "24" + "B" = **24B**.
 *
 * Pertence à PRODUÇÃO, não à diária — uma cena pode ser gravada em dois dias.
 * Quem pertence à diária é o Setup. Ver ADR-002.
 */
export interface Scene extends Audited {
  id: EntityId;
  productionId: EntityId;
  /** "24" */
  number: string;
  /** "B" — vazio quando a cena não é subdividida. */
  block: string;
  page: string;
  storyDay: string;
  intExt: IntExt | null;
  dayNight: DayNight | null;
  location: string;
  description: string;
  characters: string[];
  sortOrder: number;
}

/**
 * Setup / plano — a posição de câmera. Corresponde ao `Plano` do modelo v2:
 * é ele que define enquadramento, movimento e a configuração técnica corrente.
 */
export interface Setup extends Audited {
  id: EntityId;
  productionId: EntityId;
  sceneId: EntityId;
  /** Em qual diária este setup foi rodado. */
  shootingDayId: EntityId | null;
  /** "A", "B", "C" — ou "1", "2". */
  code: string;
  /** "Master", "Close João". */
  name: string;
  /** Tipo de captação: Normal, Série, Insert, Pickup, Drone. */
  kind: string;
  shotSize: string;
  angle: string;
  movement: string;
  screenDirection: string;
  eyeline: string;
  description: string;
  sortOrder: number;
  /**
   * Configuração de câmera corrente do setup. Serve como PADRÃO DE HERANÇA para
   * novos takes (§29) — o valor efetivo de cada take vive no `CameraTakeData`,
   * porque na prática ele muda entre takes do mesmo setup (ADR-011).
   */
  cameraDefaults: CameraConfig;
}

/**
 * Take — o registro compartilhado pelos três departamentos.
 *
 * `(setupId, number)` é único: é isso que torna a criação idempotente e resolve a
 * corrida "Câmera e Continuidade criam o take 4 ao mesmo tempo".
 */
export interface Take extends Audited {
  id: EntityId;
  productionId: EntityId;
  setupId: EntityId;
  /** Inteiro de verdade — ordena, incrementa e compara corretamente. */
  number: number;
  /** Status da tomada como evento de set. Cada departamento tem o seu próprio (ADR-010). */
  status: TakeStatus;
  durationSec: number | null;
  startedAt: Timestamp | null;
  notes: string;
}

// ============================================================
// Câmera
// ============================================================

/** Configuração de captação. Compartilhada entre `Setup.cameraDefaults` e `CameraTakeData`. */
export interface CameraConfig {
  lens: string;
  focalLength: string;
  tStop: string;
  filter: string;
  matteBox: boolean;
  iso: string;
  fps: string;
  shutter: string;
  whiteBalance: string;
  resolution: string;
  /** Formato de gravação (R3D, ARRIRAW, ProRes…). */
  recordingFormat: string;
  codec: string;
  aspectRatio: string;
  lut: string;
  colorSpace: string;
  vfx: string;
}

/** Câmera cadastrada na produção (multicam). Generaliza `CameraCadastrada` do v2. */
export interface CameraUnit extends Audited {
  id: EntityId;
  productionId: EntityId;
  /** "A", "B". */
  label: string;
  model: string;
  bodySerial: string;
  equipmentId: EntityId | null;
  operator: string;
  focusPuller: string;
  clapper: string;
}

/**
 * Dados de câmera de um take.
 *
 * UMA LINHA POR CÂMERA POR TAKE — um take rodado com duas câmeras tem dois registros.
 * É o que preserva o multicam real que o app já suporta hoje.
 */
export interface CameraTakeData extends Audited {
  id: EntityId;
  productionId: EntityId;
  takeId: EntityId;
  cameraUnitId: EntityId | null;
  /** Rótulo livre da câmera, quando não há unidade cadastrada. */
  cameraLabel: string;
  status: TakeStatus | null;
  /** "Aprovado pelo diretor" — semântica preservada do modelo v2 (ADR-010). */
  approved: boolean;
  // mídia
  card: string;
  roll: string;
  volume: string;
  fileName: string;
  mediaNotes: string;
  // configuração efetiva deste take
  config: CameraConfig;
  notes: string;
}

// ============================================================
// Som
// ============================================================

/** Configuração de som da diária (uma por `ShootingDay`). */
export interface SoundDayConfig extends Audited {
  id: EntityId;
  productionId: EntityId;
  shootingDayId: EntityId;
  sampleRate: string;
  bitDepth: string;
  frameRate: string;
  timecodeSource: string;
  dropFrame: boolean;
  fileFormat: string;
  /** `true` = poly, `false` = mono. */
  poly: boolean;
  media: string;
  roll: string;
  soundMixer: string;
  boomOperator: string;
  /** Layout de tracks herdado por todo take novo — sem limite de 4 (§11). */
  trackTemplate: SoundTrackTemplate[];
}

export interface SoundTrackTemplate {
  index: number;
  name: string;
  source: string;
  equipmentId: EntityId | null;
}

export interface SoundTakeData extends Audited {
  id: EntityId;
  productionId: EntityId;
  takeId: EntityId;
  status: TakeStatus | null;
  circled: boolean;
  soundRoll: string;
  fileName: string;
  tcStart: string;
  tcEnd: string;
  durationSec: number | null;
  wild: boolean;
  roomTone: boolean;
  wildLines: boolean;
  falseStart: boolean;
  notes: string;
}

/** Track de um take. Tabela própria justamente para não haver limite de canais. */
export interface SoundTakeTrack extends Audited {
  id: EntityId;
  productionId: EntityId;
  takeId: EntityId;
  /** 1..N */
  index: number;
  name: string;
  source: string;
  equipmentId: EntityId | null;
  notes: string;
}

// ============================================================
// Continuidade
// ============================================================

export interface ContinuityTakeData extends Audited {
  id: EntityId;
  productionId: EntityId;
  takeId: EntityId;
  status: TakeStatus | null;
  /** "Circled" da continuísta. */
  selected: boolean;
  durationSec: number | null;
  startPosition: string;
  endPosition: string;
  action: string;
  movement: string;
  direction: string;
  entrancesExits: string;
  eyeline: string;
  objectInteraction: string;
  characterInteraction: string;
  dialogueChanges: string;
  improvisation: string;
  scriptDeviation: string;
  notes: string;
}

/**
 * Escopo flexível dos registros de estado do set: um figurino vale para a cena
 * inteira; um copo pela metade vale para um take específico. Ao menos um dos três
 * precisa estar preenchido.
 */
export interface ContinuityScope {
  sceneId: EntityId | null;
  setupId: EntityId | null;
  takeId: EntityId | null;
}

export interface ContinuityProp extends Audited, ContinuityScope {
  id: EntityId;
  productionId: EntityId;
  name: string;
  position: string;
  state: string;
  quantity: string;
  interaction: string;
  notes: string;
}

export interface ContinuityWardrobe extends Audited, ContinuityScope {
  id: EntityId;
  productionId: EntityId;
  character: string;
  outfit: string;
  accessories: string;
  state: string;
  notes: string;
}

export interface ContinuityHairMakeup extends Audited, ContinuityScope {
  id: EntityId;
  productionId: EntityId;
  character: string;
  state: string;
  changes: string;
  notes: string;
}

export interface ContinuitySetDressing extends Audited, ContinuityScope {
  id: EntityId;
  productionId: EntityId;
  element: string;
  position: string;
  state: string;
  notes: string;
}

// ============================================================
// Equipamentos
// ============================================================

export interface Equipment extends Audited {
  id: EntityId;
  productionId: EntityId;
  department: Department;
  category: EquipmentCategory;
  manufacturer: string;
  model: string;
  serialNumber: string;
  nickname: string;
  quantity: string;
  notes: string;
}

/** "O que estamos usando hoje?" (§23) — equipamento em uso numa diária. */
export interface EquipmentAssignment extends Audited {
  id: EntityId;
  productionId: EntityId;
  equipmentId: EntityId;
  shootingDayId: EntityId | null;
  memberId: EntityId | null;
  department: Department;
  label: string;
  notes: string;
}

// ============================================================
// Fotografias
// ============================================================

export interface Photo extends Audited, ContinuityScope {
  id: EntityId;
  productionId: EntityId;
  subjectType: PhotoSubject | null;
  subjectId: EntityId | null;
  caption: string;
  /** Chave no blob storage. `null` enquanto a foto só existe neste dispositivo. */
  storageKey: string | null;
  remoteUrl: string | null;
  width: number | null;
  height: number | null;
  byteSize: number | null;
  mimeType: string;
  takenAt: Timestamp | null;
}

// ============================================================
// Sincronização
// ============================================================

/** Operação da fila de saída (§18). Ver docs/architecture/synchronization.md. */
export interface SyncOperation {
  /** Também é a CHAVE DE IDEMPOTÊNCIA: reenviar após timeout é seguro. */
  id: EntityId;
  userId: EntityId;
  productionId: EntityId;
  entityType: string;
  entityId: EntityId;
  operation: SyncOperationKind;
  /** Apenas os CAMPOS ALTERADOS, nunca o registro inteiro (ADR-007). */
  payload: Record<string, unknown>;
  /** Versão sobre a qual a edição foi feita — base da detecção de conflito. */
  baseVersion: number;
  createdAt: Timestamp;
  attempts: number;
  status: SyncStatus;
  lastError: string | null;
}

// ============================================================
// Agregado de transporte
// ============================================================

/**
 * Conjunto completo de entidades de uma produção. Usado pela migração
 * (LocalStorage → plataforma), pelo snapshot inicial do pull e pela exportação.
 * Não é uma tabela: é o formato em que as entidades viajam juntas.
 */
export interface ProductionSnapshot {
  production: Production;
  members: ProductionMember[];
  shootingDays: ShootingDay[];
  cameraUnits: CameraUnit[];
  scenes: Scene[];
  setups: Setup[];
  takes: Take[];
  cameraTakeData: CameraTakeData[];
  soundDayConfigs: SoundDayConfig[];
  soundTakeData: SoundTakeData[];
  soundTakeTracks: SoundTakeTrack[];
  continuityTakeData: ContinuityTakeData[];
  continuityProps: ContinuityProp[];
  continuityWardrobe: ContinuityWardrobe[];
  continuityHairMakeup: ContinuityHairMakeup[];
  continuitySetDressing: ContinuitySetDressing[];
  equipment: Equipment[];
  equipmentAssignments: EquipmentAssignment[];
  photos: Photo[];
}
