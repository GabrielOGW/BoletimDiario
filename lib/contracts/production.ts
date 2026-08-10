/**
 * Contratos de produção e sala.
 */

import { z } from 'zod';

import { DEPARTMENTS, MEMBER_ROLES } from '@/domain/platform/enums';

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

export type CreateProductionInput = z.infer<typeof createProductionSchema>;
export type JoinProductionInput = z.infer<typeof joinProductionSchema>;
