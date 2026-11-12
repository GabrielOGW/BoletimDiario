/** Opções de `<select>` derivadas dos enums — em um lugar só, para não divergirem. */

import {
  ACTIVE_DEPARTMENTS,
  DEPARTMENTS,
  EQUIPMENT_CATEGORIES,
  MEMBER_ROLES,
  type Department,
} from '@/domain/platform/enums';

import { CATEGORY_LABEL, DEPARTMENT_LABEL, ROLE_LABEL } from './labels';

/**
 * Os outros setores (Direção, Produção, Arte, Figurino…) **escondidos** da interface
 * (ADR-040). Os valores continuam no enum, no banco e nos membros que já os têm — nada é
 * apagado nem migrado. Reativar é trocar esta constante para `true`.
 */
export const MOSTRAR_OUTROS_SETORES = false;

/**
 * O departamento que representa "estou na sala para gestão" enquanto os outros setores
 * estão escondidos.
 *
 * Direção e produção entram na sala legitimamente sem boletim para preencher (ADR-031).
 * Sem esta opção, quem cria a produção sendo da direção teria de se declarar de Câmera,
 * Som ou Continuidade — e passaria a poder escrever num boletim que não é dele.
 */
const DEPARTAMENTO_DE_GESTAO: Department = 'PRODUCTION';

type Opcao = { value: Department; label: string };

const opcao = (value: Department): Opcao => ({ value, label: DEPARTMENT_LABEL[value] });

/**
 * Primeiro os três departamentos com módulo; depois, ou os outros setores (se reativados)
 * ou uma única opção de gestão. Quem é de câmera não deveria ter que percorrer onze itens
 * para se encontrar.
 */
export const DEPARTMENT_OPTIONS: Opcao[] = MOSTRAR_OUTROS_SETORES
  ? [
      ...ACTIVE_DEPARTMENTS,
      ...DEPARTMENTS.filter((department) => !ACTIVE_DEPARTMENTS.includes(department)),
    ].map(opcao)
  : [
      ...ACTIVE_DEPARTMENTS.map(opcao),
      { value: DEPARTAMENTO_DE_GESTAO, label: 'Outra função — gestão e leitura' },
    ];

/**
 * As opções para um registro que **já existe**.
 *
 * Um membro cadastrado como Arte antes de ADR-040 continua sendo de Arte. Se o `<select>`
 * não tivesse essa opção, o navegador mostraria a primeira da lista — e o primeiro "Salvar"
 * da tela trocaria o departamento dele por Câmera em silêncio. Esconder não pode reescrever.
 */
export function departmentOptionsFor(atual: Department | null | undefined): Opcao[] {
  if (!atual || DEPARTMENT_OPTIONS.some((item) => item.value === atual)) {
    return DEPARTMENT_OPTIONS;
  }
  return [...DEPARTMENT_OPTIONS, opcao(atual)];
}

/** Equipamento é sempre de um dos três departamentos com boletim (ADR-040). */
export const EQUIPMENT_DEPARTMENT_OPTIONS: Opcao[] = MOSTRAR_OUTROS_SETORES
  ? DEPARTMENT_OPTIONS
  : ACTIVE_DEPARTMENTS.map(opcao);

export function equipmentDepartmentOptionsFor(
  atual: Department | null | undefined,
): Opcao[] {
  if (!atual || EQUIPMENT_DEPARTMENT_OPTIONS.some((item) => item.value === atual)) {
    return EQUIPMENT_DEPARTMENT_OPTIONS;
  }
  return [...EQUIPMENT_DEPARTMENT_OPTIONS, opcao(atual)];
}

/**
 * `OWNER` fica de fora: virar dono é transferência de posse, não escolha de papel numa
 * lista — a regra está em `lib/db/queries/members.ts`, e a UI só não oferece o caminho.
 */
export const ROLE_OPTIONS = MEMBER_ROLES.filter((role) => role !== 'OWNER').map(
  (value) => ({ value, label: ROLE_LABEL[value] }),
);

export const CATEGORY_OPTIONS = EQUIPMENT_CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABEL[value],
}));
