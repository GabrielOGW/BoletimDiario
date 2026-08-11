/**
 * Contrato de sincronização — o mesmo arquivo no cliente e no servidor.
 *
 * Ele é a fronteira: o cliente monta o delta a partir daqui e o servidor valida contra
 * exatamente as mesmas listas. Duas cópias divergiriam em silêncio, e o sintoma seria
 * "um campo simplesmente não sincroniza" — o pior tipo de bug para depurar em set.
 *
 * Nada de Dexie e nada de Drizzle aqui dentro. Só tipos, Zod e as listas.
 */

import { z } from 'zod';

import { uuidSchema } from './production';

/**
 * Versão do protocolo (ADR-026).
 *
 * Incrementar em toda mudança incompatível: campo novo obrigatório, semântica alterada,
 * entidade renomeada. Cliente e servidor divergentes ⇒ `426`, e o cliente recusado
 * **continua editando** — o sync trava, o preenchimento nunca.
 */
export const SYNC_PROTOCOL = 2;

// ---- Entidades sincronizáveis ----

/**
 * O tipo de cada campo, e só três porque só três chegam ao cliente como JSON.
 *
 * Ele existe para a comparação do compare-and-set: `5` e `'5'` são o mesmo valor de
 * `takes.number`, e sem normalizar o servidor acusaria conflito onde não há nenhum.
 */
export type FieldKind = 'text' | 'int' | 'bool' | 'instant';

/**
 * A superfície sincronizável.
 *
 * `scene`/`setup`/`take` são compartilhados; `cameraUnit`/`cameraTakeData` são de Câmera
 * (Fase 5). Som e Continuidade entram do mesmo jeito nas Fases 6–7 — acrescentar um
 * módulo é acrescentar uma entrada aqui, não um caminho de código novo.
 *
 * `scenes.characters` está de fora de propósito: é lista ordenada, e lista ordenada não
 * tem merge por campo (limite conhecido em synchronization.md §5).
 */
export const SYNC_ENTITIES = {
  scene: {
    table: 'scenes',
    fields: {
      number: 'text',
      block: 'text',
      page: 'text',
      storyDay: 'text',
      intExt: 'text',
      dayNight: 'text',
      location: 'text',
      description: 'text',
      deletedAt: 'instant',
    },
  },
  setup: {
    table: 'setups',
    fields: {
      sceneId: 'text',
      shootingDayId: 'text',
      code: 'text',
      name: 'text',
      kind: 'text',
      shotSize: 'text',
      angle: 'text',
      movement: 'text',
      screenDirection: 'text',
      eyeline: 'text',
      description: 'text',
      sortOrder: 'int',
      deletedAt: 'instant',
    },
  },
  take: {
    table: 'takes',
    fields: {
      setupId: 'text',
      number: 'int',
      status: 'text',
      /** Natureza do take (ADR-029). Do take compartilhado, não de um departamento. */
      kind: 'text',
      durationSec: 'int',
      notes: 'text',
      deletedAt: 'instant',
    },
  },
  cameraUnit: {
    table: 'camera_units',
    fields: {
      label: 'text',
      model: 'text',
      bodySerial: 'text',
      operator: 'text',
      focusPuller: 'text',
      clapper: 'text',
      deletedAt: 'instant',
    },
  },
  /**
   * Uma linha **por câmera** por take — multicam de verdade.
   *
   * Técnica e óptica moram aqui, e não no setup (ADR-011): o foquista troca o T-stop
   * entre takes do mesmo plano, e o boletim de hoje não tem onde registrar isso. A tela
   * continua parecendo igual porque o valor é herdado do take anterior.
   */
  cameraTakeData: {
    table: 'camera_take_data',
    fields: {
      takeId: 'text',
      cameraUnitId: 'text',
      status: 'text',
      ngReason: 'text',
      approved: 'bool',
      card: 'text',
      roll: 'text',
      volume: 'text',
      fileName: 'text',
      mediaNotes: 'text',
      lens: 'text',
      focalLength: 'text',
      tStop: 'text',
      filter: 'text',
      matteBox: 'bool',
      iso: 'text',
      fps: 'text',
      shutter: 'text',
      whiteBalance: 'text',
      resolution: 'text',
      codec: 'text',
      aspectRatio: 'text',
      lut: 'text',
      colorSpace: 'text',
      vfx: 'text',
      notes: 'text',
      deletedAt: 'instant',
    },
  },
} as const satisfies Record<string, { table: string; fields: Record<string, FieldKind> }>;

export type SyncEntityType = keyof typeof SYNC_ENTITIES;

export const SYNC_ENTITY_TYPES = Object.keys(SYNC_ENTITIES) as SyncEntityType[];

/** `story_day` ← `storyDay`. O banco fala snake_case; o cliente, camelCase. */
export function toColumn(field: string): string {
  return field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** Nome de tabela → tipo de entidade. O `sync_log` guarda o nome da tabela. */
export const ENTITY_BY_TABLE: Record<string, SyncEntityType> = Object.fromEntries(
  SYNC_ENTITY_TYPES.map((type) => [SYNC_ENTITIES[type].table, type]),
);

/**
 * Compara dois valores do mesmo campo, do jeito que o compare-and-set precisa.
 *
 * Roda nos dois lados: o servidor decide o conflito com ela, e o cliente a usa para não
 * enfileirar operação de um campo que não mudou de verdade.
 */
export function sameValue(kind: FieldKind, a: unknown, b: unknown): boolean {
  return normalizeValue(kind, a) === normalizeValue(kind, b);
}

/** Valor comparável: sempre `string | null`, nunca `undefined`, nunca `NaN`. */
export function normalizeValue(kind: FieldKind, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (kind === 'int') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? String(parsed) : null;
  }

  if (kind === 'bool') {
    // `'false'` é falso: vem assim do `::text` do Postgres e de `FormData`. Passar por
    // `Boolean('false')` daria `true`, e o toggle "Aprovado" nunca desligaria.
    return value === true || value === 'true' || value === 1 ? 'true' : 'false';
  }

  if (kind === 'instant') {
    const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
    return Number.isFinite(parsed) ? String(parsed) : null;
  }

  return String(value);
}

/**
 * Valor que veio do servidor (sempre texto) de volta ao tipo do cliente.
 *
 * O servidor projeta tudo como texto de propósito — é o que torna a comparação do
 * compare-and-set independente de `DateStyle` e de driver. A conversão de volta acontece
 * num lugar só, aqui, senão cada tela reinventa um `Number(...)` esquecido.
 */
export function fromWire(kind: FieldKind, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (kind === 'int') return value === '' ? null : Number(value);
  if (kind === 'bool') return value === true || value === 'true';
  return value;
}

/** Converte a linha inteira de uma entidade, campo a campo pelo registro. */
export function rowFromWire(
  entityType: SyncEntityType,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const kinds = SYNC_ENTITIES[entityType].fields as Record<string, FieldKind>;
  const out: Record<string, unknown> = { ...row };
  for (const [field, kind] of Object.entries(kinds)) {
    if (field in row) out[field] = fromWire(kind, row[field]);
  }
  return out;
}

// ---- Push ----

/** Valor de campo que atravessa a rede. JSON puro: sem `Date`, sem objeto aninhado. */
export const fieldValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const syncOperationSchema = z.object({
  /** Também é a chave de idempotência: reenviar depois de um timeout é seguro. */
  id: uuidSchema,
  entityType: z.enum(SYNC_ENTITY_TYPES as [SyncEntityType, ...SyncEntityType[]]),
  entityId: uuidSchema,
  operation: z.enum(['CREATE', 'UPDATE', 'DELETE']),
  /** Delta com os **dois** valores — é o que dispensa histórico no servidor (ADR-018). */
  fields: z.record(
    z.string(),
    z.object({ de: fieldValueSchema, para: fieldValueSchema }),
  ),
  createdAt: z.string(),
});

export const pushRequestSchema = z.object({
  protocol: z.number().int(),
  productionId: uuidSchema,
  /** Lote limitado: um push gigante depois de uma semana offline não pode dar timeout. */
  operations: z.array(syncOperationSchema).min(1).max(200),
});

export interface FieldConflict {
  field: string;
  atual: unknown;
  atualPor: string | null;
  atualEm: string | null;
}

export interface OperationResult {
  id: string;
  status: 'APPLIED' | 'PARTIAL' | 'CONFLICT' | 'FAILED';
  applied: string[];
  conflicts: FieldConflict[];
  /** Preenchido só em `FAILED` — e nunca faz o cliente descartar o payload. */
  reason?: string;
}

export interface PushResponse {
  protocol: number;
  results: OperationResult[];
}

// ---- Pull ----

export const pullQuerySchema = z.object({
  productionId: uuidSchema,
  since: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(500),
});

export interface PullChange {
  entityType: SyncEntityType;
  entityId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  version: number;
  seq: number;
  /** `null` quando o registro sumiu de verdade — o cliente trata como apagado. */
  data: Record<string, unknown> | null;
}

export interface PullResponse {
  protocol: number;
  changes: PullChange[];
  cursor: number;
  hasMore: boolean;
}

// ---- Snapshot ----

export const snapshotQuerySchema = z.object({
  shootingDayId: uuidSchema,
});

export interface SnapshotResponse {
  protocol: number;
  productionId: string;
  cursor: number;
  shootingDay: Record<string, unknown>;
  scenes: Record<string, unknown>[];
  setups: Record<string, unknown>[];
  takes: Record<string, unknown>[];
  cameraUnits: Record<string, unknown>[];
  cameraTakeData: Record<string, unknown>[];
  /** Referência somente leitura: quem é quem na sala, para exibir autoria de conflito. */
  members: { id: string; userId: string; name: string; department: string }[];
}

export type SyncOperationInput = z.infer<typeof syncOperationSchema>;
export type PushRequest = z.infer<typeof pushRequestSchema>;
