/**
 * O Boletim de Som **local** (ADR-043) — sem conta, sem produção, sem diária.
 *
 * Hierarquia: Boletim → Cena → Plano → Take, mais os rolos/cartões do dia. O take guarda o
 * que o sound report precisa: rolo, arquivo, timecode, canais com microfone e captação,
 * julgamento, natureza, problemas.
 *
 * Puro (sem React, sem storage): testável pelas suítes `.mjs`.
 */

import { incrementSuffix } from '@/utils/sequence';

import {
  lista,
  normalizaProducao,
  novoId,
  objeto,
  producaoVazia,
  texto,
  textos,
  type BoletimLocalBase,
} from './comum';

export const SCHEMA_SOM = 1;

export interface CanalSom {
  id: string;
  indice: string;
  /** "Boom", "João". */
  nome: string;
  microfone: string;
  /** Boom, Lapela, Plant, Ambiente, Linha — ou texto livre. */
  captacao: string;
}

export interface TakeSom {
  id: string;
  numero: string;
  /** `RECORDED` (OK), `CIRCLE`, `HOLD`, `NG`, `PARTIAL` — ou vazio. */
  julgamento: string;
  /** `SYNC`, `MOS`, `WILD`, `ROOM_TONE`… — vazio é sync. */
  natureza: string;
  motivoNG: string;
  rolo: string;
  arquivo: string;
  tcInicio: string;
  tcFim: string;
  duracao: string;
  canais: CanalSom[];
  /** Códigos de `features/sound/problemas.ts` — lista aberta. */
  problemas: string[];
  obsProblemas: string;
  observacoes: string;
}

export interface PlanoSom {
  id: string;
  codigo: string;
  descricao: string;
  takes: TakeSom[];
}

export interface CenaSom {
  id: string;
  numero: string;
  planos: PlanoSom[];
}

export interface RoloSom {
  id: string;
  rotulo: string;
  midia: string;
  equipamento: string;
  observacoes: string;
}

export interface TecnicaSom {
  gravador: string;
  sampleRate: string;
  bitDepth: string;
  frameRate: string;
  timecode: string;
  formato: string;
}

export interface BoletimSom extends BoletimLocalBase {
  schemaVersion: number;
  equipe: { mixer: string; boom: string };
  tecnica: TecnicaSom;
  rolos: RoloSom[];
  cenas: CenaSom[];
}

// ---- Fábrica ----

export function criaBoletimSom(): BoletimSom {
  const agora = new Date().toISOString();
  return {
    id: novoId('som'),
    schemaVersion: SCHEMA_SOM,
    createdAt: agora,
    updatedAt: agora,
    producao: producaoVazia(),
    observacoesGerais: '',
    equipe: { mixer: '', boom: '' },
    tecnica: {
      gravador: '',
      sampleRate: '48 kHz',
      bitDepth: '24 bits',
      frameRate: '',
      timecode: '',
      formato: 'WAV poly',
    },
    rolos: [],
    cenas: [],
  };
}

export function criaRolo(rotulo = ''): RoloSom {
  return { id: novoId('rolo'), rotulo, midia: '', equipamento: '', observacoes: '' };
}

export function criaCanal(indice: number, base: Partial<CanalSom> = {}): CanalSom {
  return {
    id: novoId('canal'),
    indice: String(indice),
    nome: base.nome ?? '',
    microfone: base.microfone ?? '',
    captacao: base.captacao ?? '',
  };
}

function takeVazio(numero: string): TakeSom {
  return {
    id: novoId('take'),
    numero,
    julgamento: '',
    natureza: '',
    motivoNG: '',
    rolo: '',
    arquivo: '',
    tcInicio: '',
    tcFim: '',
    duracao: '',
    canais: [],
    problemas: [],
    obsProblemas: '',
    observacoes: '',
  };
}

/** Todos os takes do boletim, na ordem de leitura — cena, plano, take. */
export function takesEmOrdem(boletim: BoletimSom): TakeSom[] {
  return boletim.cenas.flatMap((cena) => cena.planos.flatMap((plano) => plano.takes));
}

/**
 * O próximo take do plano, **nascido preenchido** (sound.md §2, ADR-033).
 *
 * Herda do último take registrado no boletim o rolo, o arquivo incrementado e o layout de
 * canais (nome, microfone, captação). Julgamento, timecode, problemas e observações são
 * de cada take — herdá-los seria afirmar o que ninguém disse. Sem take anterior, o rolo é
 * o último cadastrado.
 */
export function proximoTake(boletim: BoletimSom, plano: PlanoSom): TakeSom {
  const numeros = plano.takes.map((take) => Number(take.numero)).filter(Number.isFinite);
  const numero = String(numeros.length > 0 ? Math.max(...numeros) + 1 : 1);

  const todos = takesEmOrdem(boletim);
  const anterior = plano.takes.at(-1) ?? todos.at(-1);
  const take = takeVazio(numero);

  if (anterior) {
    take.rolo = anterior.rolo;
    take.arquivo = anterior.arquivo ? incrementSuffix(anterior.arquivo) : '';
    take.canais = anterior.canais.map((canal) =>
      criaCanal(Number(canal.indice) || 1, canal),
    );
  } else {
    take.rolo = boletim.rolos.at(-1)?.rotulo ?? '';
  }

  return take;
}

/** O próximo código numérico de plano na cena — a convenção da Câmera ("1", "2"…). */
export function proximoCodigoPlano(cena: CenaSom | { planos: { codigo: string }[] }) {
  const numeros = cena.planos
    .map((plano) => plano.codigo.trim())
    .filter((codigo) => /^\d+$/.test(codigo))
    .map(Number);
  return String(numeros.length > 0 ? Math.max(...numeros) + 1 : 1);
}

export function criaPlano(codigo: string): PlanoSom {
  return { id: novoId('plano'), codigo, descricao: '', takes: [] };
}

export function criaCena(numero = ''): CenaSom {
  return { id: novoId('cena'), numero, planos: [] };
}

// ---- Normalização ----

function normalizaCanal(valor: unknown, indice: number): CanalSom {
  const o = objeto(valor);
  return {
    id: texto(o.id) || novoId('canal'),
    indice: texto(o.indice) || String(indice + 1),
    nome: texto(o.nome),
    microfone: texto(o.microfone),
    captacao: texto(o.captacao),
  };
}

function normalizaTake(valor: unknown, indice: number): TakeSom {
  const o = objeto(valor);
  return {
    id: texto(o.id) || novoId('take'),
    numero: texto(o.numero) || String(indice + 1),
    julgamento: texto(o.julgamento),
    natureza: texto(o.natureza),
    motivoNG: texto(o.motivoNG),
    rolo: texto(o.rolo),
    arquivo: texto(o.arquivo),
    tcInicio: texto(o.tcInicio),
    tcFim: texto(o.tcFim),
    duracao: texto(o.duracao),
    canais: lista(o.canais).map(normalizaCanal),
    problemas: textos(o.problemas),
    obsProblemas: texto(o.obsProblemas),
    observacoes: texto(o.observacoes),
  };
}

function normalizaPlano(valor: unknown, indice: number): PlanoSom {
  const o = objeto(valor);
  return {
    id: texto(o.id) || novoId('plano'),
    codigo: texto(o.codigo) || String(indice + 1),
    descricao: texto(o.descricao),
    takes: lista(o.takes).map(normalizaTake),
  };
}

/** Qualquer JSON → `BoletimSom` válido. Idempotente; não perde campo conhecido. */
export function normalizaBoletimSom(valor: unknown): BoletimSom {
  const o = objeto(valor);
  const equipe = objeto(o.equipe);
  const tecnica = objeto(o.tecnica);
  const agora = new Date().toISOString();

  return {
    id: texto(o.id) || novoId('som'),
    schemaVersion: SCHEMA_SOM,
    createdAt: texto(o.createdAt) || agora,
    updatedAt: texto(o.updatedAt) || texto(o.createdAt) || agora,
    producao: normalizaProducao(o.producao),
    observacoesGerais: texto(o.observacoesGerais),
    equipe: { mixer: texto(equipe.mixer), boom: texto(equipe.boom) },
    tecnica: {
      gravador: texto(tecnica.gravador),
      sampleRate: texto(tecnica.sampleRate),
      bitDepth: texto(tecnica.bitDepth),
      frameRate: texto(tecnica.frameRate),
      timecode: texto(tecnica.timecode),
      formato: texto(tecnica.formato),
    },
    rolos: lista(o.rolos).map((item) => {
      const r = objeto(item);
      return {
        id: texto(r.id) || novoId('rolo'),
        rotulo: texto(r.rotulo),
        midia: texto(r.midia),
        equipamento: texto(r.equipamento),
        observacoes: texto(r.observacoes),
      };
    }),
    cenas: lista(o.cenas).map((item) => {
      const c = objeto(item);
      return {
        id: texto(c.id) || novoId('cena'),
        numero: texto(c.numero),
        planos: lista(c.planos).map(normalizaPlano),
      };
    }),
  };
}

/** Quantos takes e quantos circled — para o cartão da lista. */
export function resumoSom(boletim: BoletimSom) {
  const takes = takesEmOrdem(boletim);
  return {
    cenas: boletim.cenas.length,
    takes: takes.length,
    circled: takes.filter((take) => take.julgamento === 'CIRCLE').length,
    comProblema: takes.filter((take) => take.problemas.length > 0 || take.obsProblemas)
      .length,
  };
}
