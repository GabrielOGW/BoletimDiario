/**
 * Rótulos pt-BR dos enums da plataforma.
 *
 * Ficam aqui, e não em `domain/platform/enums.ts`, porque aquele módulo é domínio puro e
 * roda também em script de migração — texto de interface não é assunto dele.
 */

import type { Department, EquipmentCategory, MemberRole } from '@/domain/platform/enums';

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

export const CATEGORY_LABEL: Record<EquipmentCategory, string> = {
  CAMERA: 'Corpo de câmera',
  LENS: 'Lente',
  FILTER: 'Filtro',
  RECORDER: 'Gravador',
  MIXER: 'Mixer',
  MICROPHONE: 'Microfone',
  WIRELESS: 'Sem fio',
  TIMECODE: 'Timecode',
  MONITOR: 'Monitor',
  MEDIA: 'Mídia',
  OTHER: 'Outro',
};

/**
 * Uma linha de texto por equipamento — o formato que sai impresso no cabeçalho.
 *
 * Mora aqui, junto dos outros rótulos, e não na camada de query: aquela é
 * `server-only` de propósito, e esta string é lida também no cliente e na folha
 * impressa. Numa função só porque os três departamentos imprimem a mesma coisa — três
 * formatações do mesmo dado é como um relatório passa a discordar do outro.
 */
export function descreveEquipamento(linha: {
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  nickname: string | null;
  label?: string | null;
}): string {
  const nome = [linha.manufacturer, linha.model].filter(Boolean).join(' ').trim();
  const identificacao = linha.nickname || nome || 'Equipamento';

  const partes = [identificacao];
  if (nome && linha.nickname) partes.push(nome);
  if (linha.serialNumber) partes.push(`s/n ${linha.serialNumber}`);
  if (linha.label) partes.push(linha.label);

  return partes.join(' · ');
}
