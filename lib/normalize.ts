import type { Boletim, Cena, MembroEquipe, MidiaSuporte, Take } from '@/types/boletim';
import { SCHEMA_VERSION } from '@/types/boletim';
import {
  createCena,
  createEmptyBoletim,
  createMembroEquipe,
  createMidiaSuporte,
  createTake,
} from '@/lib/factory';

/**
 * Normalização defensiva: transforma qualquer JSON (LocalStorage corrompido,
 * backup antigo ou parcial) em um Boletim válido e completo, sem usar `any`.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function bool(value: unknown): boolean {
  return value === true || value === 'true' || value === 1;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeTake(raw: unknown): Take {
  const base = createTake();
  if (!isRecord(raw)) return base;
  return {
    id: str(raw.id, base.id),
    numero: str(raw.numero),
    observacao: str(raw.observacao),
    aprovado: bool(raw.aprovado),
  };
}

function normalizeCena(raw: unknown): Cena {
  const base = createCena();
  if (!isRecord(raw)) return base;
  const tecnica = isRecord(raw.tecnica) ? raw.tecnica : {};
  const optica = isRecord(raw.optica) ? raw.optica : {};
  return {
    id: str(raw.id, base.id),
    numeroNome: str(raw.numeroNome),
    tecnica: {
      formatoGravacao: str(tecnica.formatoGravacao),
      resolucao: str(tecnica.resolucao),
      frameRate: str(tecnica.frameRate),
      iso: str(tecnica.iso),
      obturador: str(tecnica.obturador),
      balancoBranco: str(tecnica.balancoBranco),
      lutPerfil: str(tecnica.lutPerfil),
      espacoCor: str(tecnica.espacoCor),
      diafragma: str(tecnica.diafragma),
    },
    optica: {
      lentes: str(optica.lentes),
      filtros: str(optica.filtros),
      matteBox: bool(optica.matteBox),
    },
    cartaoRolo: str(raw.cartaoRolo),
    observacoes: str(raw.observacoes),
    takes: arr(raw.takes).map(normalizeTake),
  };
}

function normalizeMidia(raw: unknown): MidiaSuporte {
  const base = createMidiaSuporte();
  if (!isRecord(raw)) return base;
  return {
    id: str(raw.id, base.id),
    tipoMidia: str(raw.tipoMidia),
    numeroCartao: str(raw.numeroCartao),
    quantidade: str(raw.quantidade),
    responsavel: str(raw.responsavel),
  };
}

function normalizeMembro(raw: unknown): MembroEquipe {
  const base = createMembroEquipe();
  if (!isRecord(raw)) return base;
  return {
    id: str(raw.id, base.id),
    nome: str(raw.nome),
    funcao: str(raw.funcao),
  };
}

export function normalizeBoletim(raw: unknown): Boletim {
  const base = createEmptyBoletim();
  if (!isRecord(raw)) return base;

  const producao = isRecord(raw.producao) ? raw.producao : {};
  const camera = isRecord(raw.camera) ? raw.camera : {};
  const cenasDoDia = isRecord(raw.cenasDoDia) ? raw.cenasDoDia : {};
  const horarios = isRecord(raw.horarios) ? raw.horarios : {};

  return {
    id: str(raw.id, base.id),
    schemaVersion:
      typeof raw.schemaVersion === 'number' ? raw.schemaVersion : SCHEMA_VERSION,
    producao: {
      produtora: str(producao.produtora),
      tituloProjeto: str(producao.tituloProjeto),
      diretor: str(producao.diretor),
      diretorFotografia: str(producao.diretorFotografia),
      data: str(producao.data, base.producao.data),
      diaDiaria: str(producao.diaDiaria),
    },
    camera: {
      numeroId: str(camera.numeroId),
      modelo: str(camera.modelo),
      operador: str(camera.operador),
      foco: str(camera.foco),
      claquetista: str(camera.claquetista),
    },
    cenas: arr(raw.cenas).map(normalizeCena),
    midiaSuporte: arr(raw.midiaSuporte).map(normalizeMidia),
    cenasDoDia: {
      cenasRealizadas: str(cenasDoDia.cenasRealizadas),
      totalTakes: str(cenasDoDia.totalTakes),
      tomadasAprovadas: str(cenasDoDia.tomadasAprovadas),
      continuidade: str(cenasDoDia.continuidade),
    },
    horarios: {
      inicio: str(horarios.inicio),
      fim: str(horarios.fim),
      almoco: str(horarios.almoco),
      totalHoras: str(horarios.totalHoras),
      horaExtra: str(horarios.horaExtra),
    },
    equipeCamera: arr(raw.equipeCamera).map(normalizeMembro),
    observacoesGerais: str(raw.observacoesGerais),
    createdAt: str(raw.createdAt, base.createdAt),
    updatedAt: str(raw.updatedAt, base.updatedAt),
  };
}
