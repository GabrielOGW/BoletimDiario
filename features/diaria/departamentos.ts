/**
 * Os três departamentos principais, num registro só (ADR-040).
 *
 * É daqui que saem nome, descrição, rota e cor de cada departamento — na tela de "Novo
 * boletim", no cabeçalho de cada módulo e no atalho. Sem este registro, cada tela teria o
 * seu `if (departamento === 'SOUND')`, que é exatamente a condicional espalhada que faz
 * um departamento novo exigir caça ao tesouro pelo código.
 *
 * Puro (sem React, sem Dexie): testável e importável do lado do servidor.
 *
 * A cor **nunca** é a única identificação: todo lugar que pinta um departamento escreve o
 * nome dele ao lado. Amarelo, azul e verde são apoio de leitura rápida, não rótulo — e um
 * daltônico em locação, ao sol, precisa do nome.
 */

import type { Department } from '@/domain/platform/enums';

export type ModuloDeDepartamento = 'camera' | 'continuidade' | 'som';

export interface DefinicaoDeDepartamento {
  modulo: ModuloDeDepartamento;
  departamento: Department;
  nome: string;
  /** Uma linha, para a tela de escolha. */
  descricao: string;
  /** Classes da identidade visual — texto, borda e fundo suave. Literais (Tailwind JIT). */
  cor: { texto: string; borda: string; fundo: string; faixa: string };
}

export const DEPARTAMENTOS_PRINCIPAIS: readonly DefinicaoDeDepartamento[] = [
  {
    modulo: 'camera',
    departamento: 'CAMERA',
    nome: 'Boletim de Câmera',
    descricao: 'Cenas, planos e takes com óptica, configuração e mídia da câmera.',
    cor: {
      texto: 'text-brand',
      borda: 'border-brand/50',
      fundo: 'bg-brand-soft',
      faixa: 'bg-brand',
    },
  },
  {
    modulo: 'continuidade',
    departamento: 'CONTINUITY',
    nome: 'Boletim de Continuidade',
    descricao: 'Raccord, ação, diálogo, takes selecionados e fotos de continuidade.',
    cor: {
      texto: 'text-sky-400',
      borda: 'border-sky-500/50',
      fundo: 'bg-sky-500/10',
      faixa: 'bg-sky-500',
    },
  },
  {
    modulo: 'som',
    departamento: 'SOUND',
    nome: 'Boletim de Som',
    descricao: 'Rolos, arquivos, canais, microfones e problemas de captação.',
    cor: {
      texto: 'text-emerald-400',
      borda: 'border-emerald-500/50',
      fundo: 'bg-emerald-500/10',
      faixa: 'bg-emerald-500',
    },
  },
];

export function definicaoDoModulo(
  modulo: string | null | undefined,
): DefinicaoDeDepartamento | null {
  return DEPARTAMENTOS_PRINCIPAIS.find((item) => item.modulo === modulo) ?? null;
}

/** `?dep=` de `/hoje` — só aceita os três módulos; qualquer outra coisa é ignorada. */
export function moduloValido(
  valor: string | null | undefined,
): ModuloDeDepartamento | null {
  return definicaoDoModulo(valor)?.modulo ?? null;
}

/**
 * Para onde vai quem escolhe Continuidade ou Som em "Novo boletim".
 *
 * Os dois módulos vivem numa **diária** da plataforma, não num arquivo local. Havendo uma
 * diária aberta recentemente neste aparelho, o destino é ela, no módulo escolhido — e é o
 * que funciona sem rede, porque a diária já está fixada. Sem ela, `/hoje` descobre a
 * diária do dia (precisa de rede, uma vez).
 */
export function destinoDoModulo(
  modulo: ModuloDeDepartamento,
  atalho: { productionId: string; shootingDayId: string } | null,
): string {
  if (atalho) {
    return `/p/${atalho.productionId}/diarias/${atalho.shootingDayId}/${modulo}`;
  }
  return `/hoje?dep=${modulo}`;
}
