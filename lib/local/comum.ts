/**
 * O que os boletins locais de Som e Continuidade têm em comum (ADR-043).
 *
 * Como o Boletim de Câmera: tudo é string/booleano/array, para persistir no LocalStorage e
 * sair num backup sem transformação. A normalização é **defensiva** — qualquer JSON, parcial
 * ou de uma versão futura, vira um boletim válido — e idempotente.
 */

import { uid } from '@/utils/id';

export const novoId = (prefixo: string) => uid(prefixo);

export const texto = (valor: unknown): string =>
  typeof valor === 'string' ? valor : typeof valor === 'number' ? String(valor) : '';

export const booleano = (valor: unknown): boolean => valor === true;

export const lista = (valor: unknown): unknown[] => (Array.isArray(valor) ? valor : []);

export const objeto = (valor: unknown): Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};

export const textos = (valor: unknown): string[] =>
  lista(valor)
    .map(texto)
    .filter((item) => item.trim() !== '');

/** Data de hoje do aparelho, `YYYY-MM-DD` — dia civil, nunca UTC (R9). */
export function hojeISO(data: Date = new Date()): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/** Cabeçalho de produção dos dois boletins — preenchido à mão, sem sala nem diária. */
export interface ProducaoLocal {
  produtora: string;
  tituloProjeto: string;
  diretor: string;
  data: string;
  diaria: string;
  locacao: string;
}

export function producaoVazia(): ProducaoLocal {
  return {
    produtora: '',
    tituloProjeto: '',
    diretor: '',
    data: hojeISO(),
    diaria: '',
    locacao: '',
  };
}

export function normalizaProducao(valor: unknown): ProducaoLocal {
  const o = objeto(valor);
  return {
    produtora: texto(o.produtora),
    tituloProjeto: texto(o.tituloProjeto),
    diretor: texto(o.diretor),
    data: texto(o.data),
    diaria: texto(o.diaria),
    locacao: texto(o.locacao),
  };
}

/** Uma nota de raccord ou de observação, com categoria (lista aberta). */
export interface NotaLocal {
  id: string;
  categoria: string;
  texto: string;
}

export function normalizaNotas(valor: unknown): NotaLocal[] {
  return lista(valor).map((item) => {
    const o = objeto(item);
    return {
      id: texto(o.id) || novoId('nota'),
      categoria: texto(o.categoria),
      texto: texto(o.texto),
    };
  });
}

/**
 * Referência a uma foto. Os **bytes** ficam no IndexedDB (`lib/local/fotos.ts`), pelo id:
 * o LocalStorage tem cerca de 5 MB, e três fotos o encheriam.
 */
export interface FotoLocal {
  id: string;
  categoria: string;
  legenda: string;
  largura: string;
  altura: string;
}

export function normalizaFotos(valor: unknown): FotoLocal[] {
  return lista(valor)
    .map((item) => {
      const o = objeto(item);
      return {
        id: texto(o.id),
        categoria: texto(o.categoria),
        legenda: texto(o.legenda),
        largura: texto(o.largura),
        altura: texto(o.altura),
      };
    })
    .filter((foto) => foto.id !== '');
}

export interface BoletimLocalBase {
  id: string;
  createdAt: string;
  updatedAt: string;
  producao: ProducaoLocal;
  observacoesGerais: string;
}

/** Título para lista e cabeçalho — o mesmo critério do Boletim de Câmera. */
export function tituloDoBoletim(boletim: { producao: ProducaoLocal }): string {
  return boletim.producao.tituloProjeto.trim() || 'Sem título';
}
