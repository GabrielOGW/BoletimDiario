/**
 * Contratos de produção e sala.
 */

import { z } from 'zod';

import { DEPARTMENTS, EQUIPMENT_CATEGORIES, MEMBER_ROLES } from '@/domain/platform/enums';

export const departmentSchema = z.enum(DEPARTMENTS);
export const memberRoleSchema = z.enum(MEMBER_ROLES);

export const uuidSchema = z.string().uuid('Identificador inválido');

/**
 * Código de convite: `FILMEX-8K2P`.
 *
 * Normalizado antes de validar porque ele é **digitado por uma pessoa em set** — com
 * espaço colado, em minúscula, com ou sem o hífen. Recusar por causa disso seria uma
 * grosseria evitável.
 */
export const joinCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((value) => value.replace(/\s+/g, ''))
  .refine((value) => /^[A-Z0-9]{2,10}-[A-Z0-9]{4}$/.test(value), 'Código inválido');

export const createProductionSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da produção').max(160),
  company: z.string().trim().max(160).optional(),
  director: z.string().trim().max(160).optional(),
  dop: z.string().trim().max(160).optional(),
  /** Departamento de quem está criando — vira o departamento do OWNER. */
  department: departmentSchema,
});

export const joinProductionSchema = z.object({
  joinCode: joinCodeSchema,
  department: departmentSchema,
  jobTitle: z.string().trim().max(80).optional(),
});

export const updateMemberSchema = z.object({
  memberId: uuidSchema,
  role: memberRoleSchema,
  department: departmentSchema,
  jobTitle: z.string().trim().max(80).optional(),
});

/**
 * Campo opcional de texto vindo de `<form>`: o navegador manda `""`, o banco quer `null`.
 * Sem isso, um campo em branco vira string vazia e a diária "tem" unidade "".
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .default(null);

/** `HH:MM` do `<input type="time">`. Vazio é ausência de horário, não erro. */
const optionalTime = z
  .string()
  .trim()
  .transform((value) => value || null)
  .refine((value) => value === null || /^\d{2}:\d{2}$/.test(value), 'Horário inválido')
  .nullable()
  .default(null);

export const shootingDaySchema = z.object({
  /** Dia civil, nunca instante (R9) — por isso é string `YYYY-MM-DD` do início ao fim. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data da diária'),
  dayNumber: optionalText(16),
  unit: optionalText(80),
  location: optionalText(160),
  callTime: optionalTime,
  wrapTime: optionalTime,
  lunchStart: optionalTime,
  lunchEnd: optionalTime,
  notes: optionalText(2000),
});

export type CreateProductionInput = z.infer<typeof createProductionSchema>;
export type JoinProductionInput = z.infer<typeof joinProductionSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type ShootingDayInput = z.infer<typeof shootingDaySchema>;

/**
 * Equipamento do catálogo.
 *
 * Todo campo descritivo é opcional: em set, o equipamento chega antes da papelada, e
 * exigir número de série para cadastrar um microfone é como o catálogo deixa de ser
 * preenchido. Departamento e categoria bastam para o item existir e ser alocado.
 */
export const equipmentSchema = z.object({
  department: departmentSchema,
  category: z.enum(EQUIPMENT_CATEGORIES),
  manufacturer: optionalText(80),
  model: optionalText(120),
  serialNumber: optionalText(80),
  nickname: optionalText(80),
  notes: optionalText(500),
});

export const assignmentSchema = z.object({
  equipmentId: uuidSchema,
  shootingDayId: uuidSchema,
  label: optionalText(80),
});

export type EquipmentInput = z.infer<typeof equipmentSchema>;
export type AssignmentInput = z.infer<typeof assignmentSchema>;
