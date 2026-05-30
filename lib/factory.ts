import type {
  Bloco,
  Boletim,
  CameraCadastrada,
  Cena,
  CenasDoDia,
  ConfiguracoesTecnicas,
  Horarios,
  MembroEquipe,
  MidiaSuporte,
  Plano,
  Producao,
  Take,
} from '@/types/boletim';
import { SCHEMA_VERSION } from '@/types/boletim';
import { todayISODate } from '@/utils/date';
import { uid } from '@/utils/id';

export function createTake(numero = ''): Take {
  return {
    id: uid('take'),
    numero,
    cartao: '',
    clipSync: '',
    notaOperacional: '',
    aprovado: false,
  };
}

function emptyTecnica(): ConfiguracoesTecnicas {
  return {
    formatoGravacao: '',
    resolucao: '',
    frameRate: '',
    iso: '',
    obturador: '',
    balancoBranco: '',
    lutPerfil: '',
    espacoCor: '',
    diafragma: '',
  };
}

export function createPlano(numero = ''): Plano {
  return {
    id: uid('plano'),
    numero,
    tipo: 'Normal',
    cameraId: '',
    cameraNome: '',
    tecnica: emptyTecnica(),
    optica: { lentes: '', filtros: '', matteBox: false },
    observacoes: '',
    takes: [],
  };
}

export function createBloco(letra = ''): Bloco {
  return { id: uid('bloco'), letra, planos: [createPlano('1')] };
}

export function createCena(numero = ''): Cena {
  return { id: uid('cena'), numero, blocos: [createBloco('A')] };
}

export function createCameraCadastrada(): CameraCadastrada {
  return {
    id: uid('cam'),
    nomeId: '',
    modelo: '',
    operador: '',
    foco: '',
    claquetista: '',
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

function emptyCenasDoDia(): CenasDoDia {
  return { cenasRealizadas: '', totalTakes: '', tomadasAprovadas: '', continuidade: '' };
}

function emptyHorarios(): Horarios {
  return {
    inicio: '',
    fim: '',
    almocoInicio: '',
    almocoFim: '',
    almoco: '',
    totalHoras: '',
    horaExtra: '',
  };
}

export function createEmptyBoletim(): Boletim {
  const now = new Date().toISOString();
  return {
    id: uid('bol'),
    schemaVersion: SCHEMA_VERSION,
    producao: emptyProducao(),
    camerasCadastradas: [],
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

// ---- Duplicação (regenera ids aninhados) ----

export function duplicatePlano(plano: Plano): Plano {
  return {
    ...plano,
    id: uid('plano'),
    tecnica: { ...plano.tecnica },
    optica: { ...plano.optica },
    takes: plano.takes.map((take) => ({ ...take, id: uid('take') })),
  };
}

export function duplicateBloco(bloco: Bloco): Bloco {
  return {
    ...bloco,
    id: uid('bloco'),
    planos: bloco.planos.map(duplicatePlano),
  };
}

export function duplicateCena(cena: Cena): Cena {
  return {
    ...cena,
    id: uid('cena'),
    blocos: cena.blocos.map(duplicateBloco),
  };
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
    // Mantém os ids das câmeras para preservar os vínculos plano→câmera.
    camerasCadastradas: original.camerasCadastradas.map((cam) => ({ ...cam })),
    cenas: original.cenas.map(duplicateCena),
    midiaSuporte: original.midiaSuporte.map((midia) => ({ ...midia, id: uid('midia') })),
    cenasDoDia: { ...original.cenasDoDia },
    horarios: { ...original.horarios },
    equipeCamera: original.equipeCamera.map((membro) => ({ ...membro, id: uid('eq') })),
  };
}
