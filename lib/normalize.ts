import type {
  Bloco,
  Boletim,
  CameraCadastrada,
  Cena,
  ConfiguracoesTecnicas,
  MembroEquipe,
  MidiaSuporte,
  Optica,
  Plano,
  Take,
} from '@/types/boletim';
import { SCHEMA_VERSION } from '@/types/boletim';
import {
  createCameraCadastrada,
  createCena,
  createEmptyBoletim,
  createMembroEquipe,
  createMidiaSuporte,
  createPlano,
  createTake,
} from '@/lib/factory';
import { uid } from '@/utils/id';

/**
 * Normalização defensiva + MIGRAÇÃO v1 → v2.
 *
 * Transforma qualquer JSON (LocalStorage, backup antigo, parcial ou já v2) em um
 * Boletim válido e completo, sem `any`. É IDEMPOTENTE: rodar de novo num boletim
 * já v2 não altera nada.
 *
 * Migrações v1 → v2:
 *  - Cena.numeroNome "18 A 1" → Cena 18 / Bloco A / Plano 1 (carregando técnica,
 *    óptica, observações e takes para o plano).
 *  - Cena.cartaoRolo → Take.cartao (fallback).
 *  - Take.observacao → Take.notaOperacional.
 *  - Boletim.camera (única) → camerasCadastradas[0] (e vinculada aos planos).
 *  - Horarios.almoco "14:00–15:00" → almocoInicio / almocoFim.
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

function some(values: string[]): boolean {
  return values.some((v) => v.trim().length > 0);
}

// ---- Parsers de migração ----

/** "18 A 1" → { numero:18, letra:A, plano:1 } · "17.1" → { 17.1, '', '' } */
export function parseLegacyCena(raw: string): {
  numero: string;
  letra: string;
  plano: string;
} {
  const s = raw.trim();
  if (!s) return { numero: '', letra: '', plano: '' };
  const match = s.match(/^([0-9]+(?:[.,][0-9]+)?)\s*([A-Za-z]+)?\s*(.*)$/);
  if (match) {
    return {
      numero: match[1] ?? '',
      letra: (match[2] ?? '').toUpperCase(),
      plano: (match[3] ?? '').trim(),
    };
  }
  return { numero: s, letra: '', plano: '' };
}

function padTime(value: string): string {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

/** "14:00–15:00" / "12:30 às 13:30" → { inicio, fim } (vazio se não parsear). */
export function parseAlmoco(raw: string): { inicio: string; fim: string } {
  const s = raw.trim();
  if (!s) return { inicio: '', fim: '' };
  const parts = s
    .split(/\s*(?:–|—|-|\bàs\b|\bas\b|\baté\b|\bate\b)\s*/i)
    .map((part) => padTime(part))
    .filter(Boolean);
  return { inicio: parts[0] ?? '', fim: parts[1] ?? '' };
}

// ---- Normalizadores de campos ----

function normalizeTecnica(raw: unknown): ConfiguracoesTecnicas {
  const t = isRecord(raw) ? raw : {};
  return {
    formatoGravacao: str(t.formatoGravacao),
    resolucao: str(t.resolucao),
    frameRate: str(t.frameRate),
    iso: str(t.iso),
    obturador: str(t.obturador),
    balancoBranco: str(t.balancoBranco),
    lutPerfil: str(t.lutPerfil),
    espacoCor: str(t.espacoCor),
    diafragma: str(t.diafragma),
  };
}

function normalizeOptica(raw: unknown): Optica {
  const o = isRecord(raw) ? raw : {};
  return {
    lentes: str(o.lentes),
    filtros: str(o.filtros),
    matteBox: bool(o.matteBox),
  };
}

function normalizeTake(raw: unknown, fallbackCartao = ''): Take {
  const base = createTake();
  if (!isRecord(raw)) return { ...base, cartao: fallbackCartao };
  return {
    id: str(raw.id, base.id),
    numero: str(raw.numero),
    cartao: str(raw.cartao) || fallbackCartao,
    clipSync: str(raw.clipSync),
    // v1 usava "observacao"; v2 usa "notaOperacional".
    notaOperacional: str(raw.notaOperacional) || str(raw.observacao),
    aprovado: bool(raw.aprovado),
  };
}

function normalizePlano(raw: unknown): Plano {
  const base = createPlano();
  if (!isRecord(raw)) return base;
  return {
    id: str(raw.id, base.id),
    numero: str(raw.numero),
    tipo: str(raw.tipo) || 'Normal',
    cameraId: str(raw.cameraId),
    cameraNome: str(raw.cameraNome),
    tecnica: normalizeTecnica(raw.tecnica),
    optica: normalizeOptica(raw.optica),
    observacoes: str(raw.observacoes),
    takes: arr(raw.takes).map((take) => normalizeTake(take)),
  };
}

function normalizeBloco(raw: unknown): Bloco {
  if (!isRecord(raw)) return { id: uid('bloco'), letra: '', planos: [] };
  return {
    id: str(raw.id, uid('bloco')),
    letra: str(raw.letra),
    planos: arr(raw.planos).map(normalizePlano),
  };
}

/** Migra uma cena v1 (numeroNome + técnica/óptica/takes na cena) para v2. */
function migrateLegacyCena(raw: Record<string, unknown>): Cena {
  const numeroNome = str(raw.numeroNome);
  const parsed = parseLegacyCena(numeroNome);
  const cartaoRolo = str(raw.cartaoRolo);

  const plano: Plano = {
    id: uid('plano'),
    numero: parsed.plano || '1',
    tipo: 'Normal',
    cameraId: '',
    cameraNome: '',
    tecnica: normalizeTecnica(raw.tecnica),
    optica: normalizeOptica(raw.optica),
    observacoes: str(raw.observacoes),
    takes: arr(raw.takes).map((take) => normalizeTake(take, cartaoRolo)),
  };
  const bloco: Bloco = { id: uid('bloco'), letra: parsed.letra || 'A', planos: [plano] };

  return {
    id: str(raw.id, uid('cena')),
    numero: parsed.numero || numeroNome,
    blocos: [bloco],
  };
}

function normalizeCena(raw: unknown): Cena {
  if (!isRecord(raw)) return createCena();
  // Formato v2 (já tem blocos) → normaliza direto (idempotente).
  if (Array.isArray(raw.blocos)) {
    return {
      id: str(raw.id, uid('cena')),
      numero: str(raw.numero) || str(raw.numeroNome),
      blocos: raw.blocos.map(normalizeBloco),
    };
  }
  // Formato v1 → migra.
  return migrateLegacyCena(raw);
}

function normalizeCamera(raw: unknown): CameraCadastrada {
  const base = createCameraCadastrada();
  if (!isRecord(raw)) return base;
  return {
    id: str(raw.id, base.id),
    nomeId: str(raw.nomeId),
    modelo: str(raw.modelo),
    operador: str(raw.operador),
    foco: str(raw.foco),
    claquetista: str(raw.claquetista),
  };
}

/** Migra a câmera única v1 para a lista de câmeras cadastradas v2. */
function migrateLegacyCamera(raw: unknown): CameraCadastrada[] {
  if (!isRecord(raw)) return [];
  const cam: CameraCadastrada = {
    id: 'cam-legacy',
    nomeId: str(raw.numeroId),
    modelo: str(raw.modelo),
    operador: str(raw.operador),
    foco: str(raw.foco),
    claquetista: str(raw.claquetista),
  };
  if (!some([cam.nomeId, cam.modelo, cam.operador, cam.foco, cam.claquetista])) return [];
  if (!cam.nomeId) cam.nomeId = 'A';
  return [cam];
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
  const cenasDoDia = isRecord(raw.cenasDoDia) ? raw.cenasDoDia : {};
  const horarios = isRecord(raw.horarios) ? raw.horarios : {};

  // Câmeras: v2 já tem a lista; v1 tinha `camera` única.
  const legacyCameras = !Array.isArray(raw.camerasCadastradas);
  const camerasCadastradas = legacyCameras
    ? migrateLegacyCamera(raw.camera)
    : (raw.camerasCadastradas as unknown[]).map(normalizeCamera);

  const cenas = arr(raw.cenas).map(normalizeCena);

  // Vincula a câmera legada (única) aos planos migrados sem câmera.
  if (legacyCameras && camerasCadastradas.length === 1) {
    const def = camerasCadastradas[0];
    for (const cena of cenas) {
      for (const bloco of cena.blocos) {
        for (const plano of bloco.planos) {
          if (!plano.cameraId && !plano.cameraNome) {
            plano.cameraId = def.id;
            plano.cameraNome = def.nomeId;
          }
        }
      }
    }
  }

  // Horários: usa início/fim de almoço; se ausentes, parseia o `almoco` v1.
  const legacyAlmoco = str(horarios.almoco);
  let almocoInicio = str(horarios.almocoInicio);
  let almocoFim = str(horarios.almocoFim);
  if (!almocoInicio && !almocoFim && legacyAlmoco) {
    const parsed = parseAlmoco(legacyAlmoco);
    almocoInicio = parsed.inicio;
    almocoFim = parsed.fim;
  }

  return {
    id: str(raw.id, base.id),
    schemaVersion: SCHEMA_VERSION,
    producao: {
      produtora: str(producao.produtora),
      tituloProjeto: str(producao.tituloProjeto),
      diretor: str(producao.diretor),
      diretorFotografia: str(producao.diretorFotografia),
      data: str(producao.data, base.producao.data),
      diaDiaria: str(producao.diaDiaria),
    },
    camerasCadastradas,
    cenas,
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
      almocoInicio,
      almocoFim,
      almoco: legacyAlmoco,
      totalHoras: str(horarios.totalHoras),
      horaExtra: str(horarios.horaExtra),
    },
    equipeCamera: arr(raw.equipeCamera).map(normalizeMembro),
    observacoesGerais: str(raw.observacoesGerais),
    createdAt: str(raw.createdAt, base.createdAt),
    updatedAt: str(raw.updatedAt, base.updatedAt),
  };
}
