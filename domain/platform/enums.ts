/**
 * Enumerações compartilhadas da plataforma.
 *
 * Declaradas como arrays `as const` + union type (e não como `enum` do TypeScript)
 * por três motivos:
 *  - o valor persiste como string simples no JSON, no IndexedDB e no Postgres;
 *  - a lista fica iterável em runtime (validação, <select>, testes);
 *  - `enum` não é suportado pelo type-stripping do Node usado nos testes.
 *
 * Cada lista espelha 1:1 um enum nativo do Postgres — ver docs/architecture/database.md.
 */

// ---- Departamentos ----

export const DEPARTMENTS = [
  'CAMERA',
  'SOUND',
  'CONTINUITY',
  'DIRECTION',
  'PRODUCTION',
  'DIT',
  'LIGHTING',
  'ART',
  'WARDROBE',
  'MAKEUP',
  'EDITORIAL',
] as const;

export type Department = (typeof DEPARTMENTS)[number];

/**
 * Departamentos com módulo implementado. Os demais já existem no enum para que
 * incluí-los no futuro não exija mudança de arquitetura — só de UI.
 */
export const ACTIVE_DEPARTMENTS: readonly Department[] = [
  'CAMERA',
  'SOUND',
  'CONTINUITY',
];

// ---- Papel na sala (NÃO confundir com departamento) ----

export const MEMBER_ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Ordem de precedência dos papéis (maior = mais poder). */
const ROLE_RANK: Record<MemberRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

/** `true` quando `role` é pelo menos tão poderoso quanto `minimum`. */
export function roleAtLeast(role: MemberRole, minimum: MemberRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

// ---- Status do take ----

export const TAKE_STATUSES = [
  'RECORDED',
  'CIRCLE',
  'NG',
  'PARTIAL',
  'WILD',
  'ROOM_TONE',
  'FALSE_START',
] as const;

export type TakeStatus = (typeof TAKE_STATUSES)[number];

/**
 * Rótulos das ações rápidas de set. Configuráveis por produção no futuro
 * (ver docs/features/sound.md).
 */
export const TAKE_STATUS_LABEL: Record<TakeStatus, string> = {
  RECORDED: 'OK',
  CIRCLE: 'Circle',
  NG: 'NG',
  PARTIAL: 'Parcial',
  WILD: 'Wild',
  ROOM_TONE: 'Room tone',
  FALSE_START: 'False start',
};

// ---- Equipamentos ----

export const EQUIPMENT_CATEGORIES = [
  'CAMERA',
  'LENS',
  'FILTER',
  'RECORDER',
  'MIXER',
  'MICROPHONE',
  'WIRELESS',
  'TIMECODE',
  'MONITOR',
  'MEDIA',
  'OTHER',
] as const;

export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

// ---- Cena ----

export const INT_EXT_VALUES = ['INT', 'EXT', 'INT_EXT'] as const;
export type IntExt = (typeof INT_EXT_VALUES)[number];

export const DAY_NIGHT_VALUES = ['DAY', 'NIGHT', 'DAWN', 'DUSK'] as const;
export type DayNight = (typeof DAY_NIGHT_VALUES)[number];

// ---- Sincronização ----

export const SYNC_OPERATIONS = ['CREATE', 'UPDATE', 'DELETE'] as const;
export type SyncOperationKind = (typeof SYNC_OPERATIONS)[number];

export const SYNC_STATUSES = [
  'PENDING',
  'SYNCING',
  'SYNCED',
  'FAILED',
  'CONFLICT',
] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

/** Sujeito ao qual uma fotografia de continuidade pode se referir. */
export const PHOTO_SUBJECTS = [
  'FRAME',
  'CHARACTER',
  'WARDROBE',
  'PROP',
  'SET',
  'MAKEUP',
] as const;
export type PhotoSubject = (typeof PHOTO_SUBJECTS)[number];

// ---- Guardas de tipo (uso na normalização de payload) ----

function includes<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

export function isDepartment(value: unknown): value is Department {
  return includes(DEPARTMENTS, value);
}

export function isMemberRole(value: unknown): value is MemberRole {
  return includes(MEMBER_ROLES, value);
}

export function isTakeStatus(value: unknown): value is TakeStatus {
  return includes(TAKE_STATUSES, value);
}

export function isEquipmentCategory(value: unknown): value is EquipmentCategory {
  return includes(EQUIPMENT_CATEGORIES, value);
}

/**
 * Departamento pode escrever nos dados especializados de `target`?
 * A LEITURA é sempre livre para qualquer membro — é a razão de existir da plataforma
 * (ver docs/architecture/permissions.md).
 */
export function canWriteDepartmentData(
  memberDepartments: readonly Department[],
  target: Department,
): boolean {
  return memberDepartments.includes(target);
}
