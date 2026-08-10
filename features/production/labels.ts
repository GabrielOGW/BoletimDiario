/**
 * Rótulos pt-BR dos enums da plataforma.
 *
 * Ficam aqui, e não em `domain/platform/enums.ts`, porque aquele módulo é domínio puro e
 * roda também em script de migração — texto de interface não é assunto dele.
 */

import type { Department, MemberRole } from '@/domain/platform/enums';

export const DEPARTMENT_LABEL: Record<Department, string> = {
  CAMERA: 'Câmera',
  SOUND: 'Som',
  CONTINUITY: 'Continuidade',
  DIRECTION: 'Direção',
  PRODUCTION: 'Produção',
  DIT: 'DIT',
  LIGHTING: 'Elétrica / Maquinária',
  ART: 'Arte',
  WARDROBE: 'Figurino',
  MAKEUP: 'Maquiagem',
  EDITORIAL: 'Montagem',
};

export const ROLE_LABEL: Record<MemberRole, string> = {
  OWNER: 'Dono',
  ADMIN: 'Administrador',
  MEMBER: 'Membro',
  VIEWER: 'Observador',
};

export const ROLE_HINT: Record<MemberRole, string> = {
  OWNER: 'Criou a produção. Único que pode excluí-la e transferir a posse.',
  ADMIN: 'Gerencia sala, membros, código de convite e diárias.',
  MEMBER: 'Trabalha: cria cenas, setups e takes e escreve no seu departamento.',
  VIEWER: 'Só leitura.',
};

/** `2026-08-10` → `10/08/2026`. Sem `Date`: a diária é dia civil, não instante (R9). */
export function formatDiaria(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}
