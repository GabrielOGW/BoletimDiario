import type { Boletim } from '@/types/boletim';
import { loadAll } from '@/lib/storage';
import { PRESETS } from '@/lib/constants';

/**
 * Autocomplete inteligente: sugestões construídas a partir do USO real
 * (valores já digitados em boletins anteriores) + presets fixos.
 * As sugestões nunca são obrigatórias — apenas alimentam os <datalist>.
 */
export interface Suggestions {
  formatoGravacao: string[];
  resolucao: string[];
  frameRate: string[];
  iso: string[];
  obturador: string[];
  balancoBranco: string[];
  lutPerfil: string[];
  espacoCor: string[];
  diafragma: string[];
  lentes: string[];
  filtros: string[];
  tipoPlano: string[];
  cameraNome: string[];
  cartao: string[];
  clipSync: string[];
  tipoMidia: string[];
  funcao: string[];
}

type Field = keyof Suggestions;

const FIELDS: Field[] = [
  'formatoGravacao',
  'resolucao',
  'frameRate',
  'iso',
  'obturador',
  'balancoBranco',
  'lutPerfil',
  'espacoCor',
  'diafragma',
  'lentes',
  'filtros',
  'tipoPlano',
  'cameraNome',
  'cartao',
  'clipSync',
  'tipoMidia',
  'funcao',
];

// Presets por campo (campos sem preset usam lista vazia).
const PRESET_BY_FIELD: Record<Field, readonly string[]> = {
  formatoGravacao: PRESETS.formatoGravacao,
  resolucao: PRESETS.resolucao,
  frameRate: PRESETS.frameRate,
  iso: PRESETS.iso,
  obturador: PRESETS.obturador,
  balancoBranco: PRESETS.balancoBranco,
  lutPerfil: PRESETS.lutPerfil,
  espacoCor: PRESETS.espacoCor,
  diafragma: PRESETS.diafragma,
  lentes: PRESETS.lentes,
  filtros: PRESETS.filtros,
  tipoPlano: PRESETS.tipoPlano,
  cameraNome: [],
  cartao: [],
  clipSync: [],
  tipoMidia: PRESETS.tipoMidia,
  funcao: PRESETS.funcao,
};

function merge(used: Set<string>, preset: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  // Valores usados primeiro (mais relevantes), depois os presets.
  for (const value of used) {
    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(value);
    }
  }
  for (const value of preset) {
    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(value);
    }
  }
  return out;
}

export function emptySuggestions(): Suggestions {
  const result = {} as Suggestions;
  for (const field of FIELDS) {
    result[field] = [...PRESET_BY_FIELD[field]];
  }
  return result;
}

export function collectSuggestions(boletins: Boletim[] = loadAll()): Suggestions {
  const sets = {} as Record<Field, Set<string>>;
  for (const field of FIELDS) sets[field] = new Set<string>();

  const add = (field: Field, value: string) => {
    const trimmed = value.trim();
    if (trimmed) sets[field].add(trimmed);
  };

  for (const boletim of boletins) {
    for (const cam of boletim.camerasCadastradas) add('cameraNome', cam.nomeId);
    for (const cena of boletim.cenas) {
      for (const bloco of cena.blocos) {
        for (const plano of bloco.planos) {
          add('tipoPlano', plano.tipo);
          add('cameraNome', plano.cameraNome);
          add('formatoGravacao', plano.tecnica.formatoGravacao);
          add('resolucao', plano.tecnica.resolucao);
          add('frameRate', plano.tecnica.frameRate);
          add('iso', plano.tecnica.iso);
          add('obturador', plano.tecnica.obturador);
          add('balancoBranco', plano.tecnica.balancoBranco);
          add('lutPerfil', plano.tecnica.lutPerfil);
          add('espacoCor', plano.tecnica.espacoCor);
          add('diafragma', plano.tecnica.diafragma);
          add('lentes', plano.optica.lentes);
          add('filtros', plano.optica.filtros);
          for (const take of plano.takes) {
            add('cartao', take.cartao);
            add('clipSync', take.clipSync);
          }
        }
      }
    }
    for (const midia of boletim.midiaSuporte) {
      add('tipoMidia', midia.tipoMidia);
      add('cartao', midia.numeroCartao);
    }
    for (const membro of boletim.equipeCamera) add('funcao', membro.funcao);
  }

  const result = {} as Suggestions;
  for (const field of FIELDS) {
    result[field] = merge(sets[field], PRESET_BY_FIELD[field]);
  }
  return result;
}
