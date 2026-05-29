import type {
  Boletim,
  Camera,
  Cena,
  CenasDoDia,
  Horarios,
  MembroEquipe,
  MidiaSuporte,
  Producao,
  Take,
} from '@/types/boletim';
import { SCHEMA_VERSION } from '@/types/boletim';
import { todayISODate } from '@/utils/date';
import { uid } from '@/utils/id';

export function createTake(numero = ''): Take {
  return { id: uid('take'), numero, observacao: '', aprovado: false };
}

export function createCena(numeroNome = ''): Cena {
  return {
    id: uid('cena'),
    numeroNome,
    tecnica: {
      formatoGravacao: '',
      resolucao: '',
      frameRate: '',
      iso: '',
      obturador: '',
      balancoBranco: '',
      lutPerfil: '',
      espacoCor: '',
      diafragma: '',
    },
    optica: {
      lentes: '',
      filtros: '',
      matteBox: false,
    },
    cartaoRolo: '',
    observacoes: '',
    takes: [],
  };
}

export function createMidiaSuporte(): MidiaSuporte {
  return {
    id: uid('midia'),
    tipoMidia: '',
    numeroCartao: '',
    quantidade: '',
    responsavel: '',
  };
}

export function createMembroEquipe(): MembroEquipe {
  return { id: uid('eq'), nome: '', funcao: '' };
}

function emptyProducao(): Producao {
  return {
    produtora: '',
    tituloProjeto: '',
    diretor: '',
    diretorFotografia: '',
    data: todayISODate(),
    diaDiaria: '',
  };
}

function emptyCamera(): Camera {
  return { numeroId: '', modelo: '', operador: '', foco: '', claquetista: '' };
}

function emptyCenasDoDia(): CenasDoDia {
  return { cenasRealizadas: '', totalTakes: '', tomadasAprovadas: '', continuidade: '' };
}

function emptyHorarios(): Horarios {
  return { inicio: '', fim: '', almoco: '', totalHoras: '', horaExtra: '' };
}

function appendCopy(title: string): string {
  const trimmed = title.trim();
  return trimmed ? `${trimmed} (cópia)` : 'Boletim (cópia)';
}

/** Clona um boletim regenerando TODOS os ids aninhados (sem colisões). */
export function duplicateBoletim(original: Boletim): Boletim {
  const now = new Date().toISOString();
  return {
    ...original,
    id: uid('bol'),
    createdAt: now,
    updatedAt: now,
    producao: {
      ...original.producao,
      tituloProjeto: appendCopy(original.producao.tituloProjeto),
    },
    camera: { ...original.camera },
    cenas: original.cenas.map((cena) => ({
      ...cena,
      id: uid('cena'),
      tecnica: { ...cena.tecnica },
      optica: { ...cena.optica },
      takes: cena.takes.map((take) => ({ ...take, id: uid('take') })),
    })),
    midiaSuporte: original.midiaSuporte.map((midia) => ({ ...midia, id: uid('midia') })),
    cenasDoDia: { ...original.cenasDoDia },
    horarios: { ...original.horarios },
    equipeCamera: original.equipeCamera.map((membro) => ({ ...membro, id: uid('eq') })),
  };
}

export function createEmptyBoletim(): Boletim {
  const now = new Date().toISOString();
  return {
    id: uid('bol'),
    schemaVersion: SCHEMA_VERSION,
    producao: emptyProducao(),
    camera: emptyCamera(),
    cenas: [],
    midiaSuporte: [],
    cenasDoDia: emptyCenasDoDia(),
    horarios: emptyHorarios(),
    equipeCamera: [],
    observacoesGerais: '',
    createdAt: now,
    updatedAt: now,
  };
}
