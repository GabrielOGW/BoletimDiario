/**
 * O Boletim de Continuidade **local** (ADR-043) — sem conta, sem produção, sem diária.
 *
 * Hierarquia: Boletim → Cena → Plano → Take. Cena, plano e take carregam notas de raccord
 * e fotografias; o take carrega o veredito, a duração, a ação e o problema de continuidade.
 *
 * Os nomes de campo do take espelham `continuity_take_data` de propósito: o relatório lê
 * este boletim pela mesma estrutura que lê a plataforma (`features/continuity/estrutura.ts`),
 * e quando o boletim for levado para uma diária, nada precisa ser renomeado.
 */

import {
  booleano,
  lista,
  normalizaFotos,
  normalizaNotas,
  normalizaProducao,
  novoId,
  objeto,
  producaoVazia,
  texto,
  type BoletimLocalBase,
  type FotoLocal,
  type NotaLocal,
} from './comum';

export const SCHEMA_CONTINUIDADE = 1;

/** Campos de ação do take — os mesmos catorze de `CAMPOS_DE_ACAO`. */
export const CAMPOS_ACAO_LOCAL = [
  'startPosition',
  'endPosition',
  'action',
  'movement',
  'direction',
  'entrancesExits',
  'eyeline',
  'objectInteraction',
  'characterInteraction',
  'dialogueChanges',
  'improvisation',
  'scriptDeviation',
] as const;

export type CampoAcaoLocal = (typeof CAMPOS_ACAO_LOCAL)[number];

export interface TakeContinuidade {
  id: string;
  numero: string;
  /** `CIRCLE` (print), `HOLD`, `NG` — ou vazio. */
  veredito: string;
  motivoNG: string;
  /** "00:42" — como se lê no cronômetro. */
  duracao: string;
  acao: Record<CampoAcaoLocal, string>;
  problema: boolean;
  problemaDescricao: string;
  observacoes: string;
  notas: NotaLocal[];
  fotos: FotoLocal[];
}

export interface PlanoContinuidade {
  id: string;
  codigo: string;
  tamanho: string;
  angulo: string;
  movimento: string;
  eyeline: string;
  descricao: string;
  notas: NotaLocal[];
  fotos: FotoLocal[];
  takes: TakeContinuidade[];
}

export interface CenaContinuidade {
  id: string;
  numero: string;
  pagina: string;
  diaHistoria: string;
  intExt: string;
  diaNoite: string;
  locacao: string;
  descricao: string;
  notas: NotaLocal[];
  fotos: FotoLocal[];
  planos: PlanoContinuidade[];
}

export interface BoletimContinuidade extends BoletimLocalBase {
  schemaVersion: number;
  continuista: string;
  cenas: CenaContinuidade[];
}

// ---- Fábrica ----

export function criaBoletimContinuidade(): BoletimContinuidade {
  const agora = new Date().toISOString();
  return {
    id: novoId('cont'),
    schemaVersion: SCHEMA_CONTINUIDADE,
    createdAt: agora,
    updatedAt: agora,
    producao: producaoVazia(),
    continuista: '',
    observacoesGerais: '',
    cenas: [],
  };
}

const acaoVazia = (): Record<CampoAcaoLocal, string> =>
  Object.fromEntries(CAMPOS_ACAO_LOCAL.map((campo) => [campo, ''])) as Record<
    CampoAcaoLocal,
    string
  >;

/**
 * O próximo take, **vazio**. Nada é herdado do anterior: o que a continuidade registra é o
 * que aconteceu neste take — herdar "João entra pela esquerda" seria afirmar algo que
 * ninguém observou.
 */
export function proximoTakeContinuidade(plano: PlanoContinuidade): TakeContinuidade {
  const numeros = plano.takes.map((take) => Number(take.numero)).filter(Number.isFinite);
  return {
    id: novoId('take'),
    numero: String(numeros.length > 0 ? Math.max(...numeros) + 1 : 1),
    veredito: '',
    motivoNG: '',
    duracao: '',
    acao: acaoVazia(),
    problema: false,
    problemaDescricao: '',
    observacoes: '',
    notas: [],
    fotos: [],
  };
}

export function criaPlanoContinuidade(codigo: string): PlanoContinuidade {
  return {
    id: novoId('plano'),
    codigo,
    tamanho: '',
    angulo: '',
    movimento: '',
    eyeline: '',
    descricao: '',
    notas: [],
    fotos: [],
    takes: [],
  };
}

export function criaCenaContinuidade(numero = ''): CenaContinuidade {
  return {
    id: novoId('cena'),
    numero,
    pagina: '',
    diaHistoria: '',
    intExt: '',
    diaNoite: '',
    locacao: '',
    descricao: '',
    notas: [],
    fotos: [],
    planos: [],
  };
}

export function criaNota(categoria: string, valor: string): NotaLocal {
  return { id: novoId('nota'), categoria, texto: valor };
}

// ---- Normalização ----

function normalizaTake(valor: unknown, indice: number): TakeContinuidade {
  const o = objeto(valor);
  const acao = objeto(o.acao);
  return {
    id: texto(o.id) || novoId('take'),
    numero: texto(o.numero) || String(indice + 1),
    veredito: texto(o.veredito),
    motivoNG: texto(o.motivoNG),
    duracao: texto(o.duracao),
    acao: Object.fromEntries(
      CAMPOS_ACAO_LOCAL.map((campo) => [campo, texto(acao[campo])]),
    ) as Record<CampoAcaoLocal, string>,
    problema: booleano(o.problema),
    problemaDescricao: texto(o.problemaDescricao),
    observacoes: texto(o.observacoes),
    notas: normalizaNotas(o.notas),
    fotos: normalizaFotos(o.fotos),
  };
}

function normalizaPlano(valor: unknown, indice: number): PlanoContinuidade {
  const o = objeto(valor);
  return {
    id: texto(o.id) || novoId('plano'),
    codigo: texto(o.codigo) || String(indice + 1),
    tamanho: texto(o.tamanho),
    angulo: texto(o.angulo),
    movimento: texto(o.movimento),
    eyeline: texto(o.eyeline),
    descricao: texto(o.descricao),
    notas: normalizaNotas(o.notas),
    fotos: normalizaFotos(o.fotos),
    takes: lista(o.takes).map(normalizaTake),
  };
}

/** Qualquer JSON → `BoletimContinuidade` válido. Idempotente. */
export function normalizaBoletimContinuidade(valor: unknown): BoletimContinuidade {
  const o = objeto(valor);
  const agora = new Date().toISOString();
  return {
    id: texto(o.id) || novoId('cont'),
    schemaVersion: SCHEMA_CONTINUIDADE,
    createdAt: texto(o.createdAt) || agora,
    updatedAt: texto(o.updatedAt) || texto(o.createdAt) || agora,
    producao: normalizaProducao(o.producao),
    continuista: texto(o.continuista),
    observacoesGerais: texto(o.observacoesGerais),
    cenas: lista(o.cenas).map((item) => {
      const c = objeto(item);
      return {
        id: texto(c.id) || novoId('cena'),
        numero: texto(c.numero),
        pagina: texto(c.pagina),
        diaHistoria: texto(c.diaHistoria),
        intExt: texto(c.intExt),
        diaNoite: texto(c.diaNoite),
        locacao: texto(c.locacao),
        descricao: texto(c.descricao),
        notas: normalizaNotas(c.notas),
        fotos: normalizaFotos(c.fotos),
        planos: lista(c.planos).map(normalizaPlano),
      };
    }),
  };
}

/** Todos os ids de foto do boletim — para apagar os bytes junto com o boletim. */
export function idsDasFotos(boletim: BoletimContinuidade): string[] {
  return boletim.cenas.flatMap((cena) => [
    ...cena.fotos.map((foto) => foto.id),
    ...cena.planos.flatMap((plano) => [
      ...plano.fotos.map((foto) => foto.id),
      ...plano.takes.flatMap((take) => take.fotos.map((foto) => foto.id)),
    ]),
  ]);
}

export function resumoContinuidade(boletim: BoletimContinuidade) {
  const takes = boletim.cenas.flatMap((cena) => cena.planos.flatMap((p) => p.takes));
  return {
    cenas: boletim.cenas.length,
    takes: takes.length,
    prints: takes.filter((take) => take.veredito === 'CIRCLE').length,
    comProblema: takes.filter((take) => take.problema).length,
    fotos: idsDasFotos(boletim).length,
  };
}
