/** Opções de `<select>` derivadas dos enums — em um lugar só, para não divergirem. */

import { ACTIVE_DEPARTMENTS, DEPARTMENTS, MEMBER_ROLES } from '@/domain/platform/enums';

import { DEPARTMENT_LABEL, ROLE_LABEL } from './labels';

/**
 * Primeiro os três departamentos com módulo, depois o resto. Quem é de câmera não
 * deveria ter que percorrer onze itens para se encontrar.
 */
export const DEPARTMENT_OPTIONS = [
  ...ACTIVE_DEPARTMENTS,
  ...DEPARTMENTS.filter((department) => !ACTIVE_DEPARTMENTS.includes(department)),
].map((value) => ({ value, label: DEPARTMENT_LABEL[value] }));

/**
 * `OWNER` fica de fora: virar dono é transferência de posse, não escolha de papel numa
 * lista — a regra está em `lib/db/queries/members.ts`, e a UI só não oferece o caminho.
 */
export const ROLE_OPTIONS = MEMBER_ROLES.filter((role) => role !== 'OWNER').map(
  (value) => ({ value, label: ROLE_LABEL[value] }),
);
