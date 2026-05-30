import type { Boletim } from '@/types/boletim';

/** Estatísticas derivadas de um boletim (calculadas, nunca persistidas). */
export interface BoletimStats {
  totalCenas: number;
  totalBlocos: number;
  totalPlanos: number;
  totalTakes: number;
  takesAprovados: number;
}

export function computeStats(boletim: Boletim): BoletimStats {
  let totalBlocos = 0;
  let totalPlanos = 0;
  let totalTakes = 0;
  let takesAprovados = 0;

  for (const cena of boletim.cenas) {
    totalBlocos += cena.blocos.length;
    for (const bloco of cena.blocos) {
      totalPlanos += bloco.planos.length;
      for (const plano of bloco.planos) {
        totalTakes += plano.takes.length;
        takesAprovados += plano.takes.filter((take) => take.aprovado).length;
      }
    }
  }

  return {
    totalCenas: boletim.cenas.length,
    totalBlocos,
    totalPlanos,
    totalTakes,
    takesAprovados,
  };
}

/** Título amigável de um boletim para listagem / nome de arquivo. */
export function boletimTitle(boletim: Boletim): string {
  const titulo = boletim.producao.tituloProjeto.trim();
  return titulo || 'Boletim sem título';
}

/** Slug seguro para nomes de arquivo a partir de um texto livre. */
export function slugify(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'boletim'
  );
}
