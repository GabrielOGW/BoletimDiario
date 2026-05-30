/**
 * Modelo de domínio do Boletim Diário de Câmera.
 *
 * Tudo é serializável em JSON (apenas strings/booleans/arrays) para persistir
 * direto no LocalStorage e permitir export/import de backup sem transformação.
 *
 * Hierarquia (baseada em uso real de set):
 *   Boletim → Produção → Câmeras cadastradas
 *           → Cena → Bloco (letra) → Plano → Take
 */

/**
 * Versão do schema persistido.
 * v1 = Cena(numeroNome) → Take(observacao); câmera única; cartaoRolo na cena.
 * v2 = Cena(numero) → Bloco → Plano → Take(cartão/clip/nota); multicam; mídia no take.
 */
export const SCHEMA_VERSION = 2 as const;

/** Configurações técnicas de captação (no Plano). */
export interface ConfiguracoesTecnicas {
  formatoGravacao: string;
  resolucao: string;
  frameRate: string;
  iso: string;
  obturador: string;
  balancoBranco: string;
  lutPerfil: string;
  espacoCor: string;
  diafragma: string;
}

/** Óptica usada no Plano. */
export interface Optica {
  lentes: string;
  filtros: string;
  matteBox: boolean;
}

/** Take individual — agora com mídia e sync para logger/pós. */
export interface Take {
  id: string;
  numero: string;
  /** Cartão de gravação (movido da cena para o take). */
  cartao: string;
  /** Clip / nome de arquivo / ponto de sync. */
  clipSync: string;
  /** Nota operacional (REC falso, foco perdido, sombra, boom, série…). */
  notaOperacional: string;
  /** Requisito principal: marcado quando o diretor aprova o take. */
  aprovado: boolean;
}

/** Plano — a UNIDADE PRINCIPAL de preenchimento. */
export interface Plano {
  id: string;
  numero: string;
  /** Tipo / captação: Normal, Série, Insert, Pickup, Drone, Custom. */
  tipo: string;
  /** Câmera utilizada — referência à câmera cadastrada (quando houver). */
  cameraId: string;
  /** Rótulo da câmera (texto livre / fallback quando não cadastrada). */
  cameraNome: string;
  tecnica: ConfiguracoesTecnicas;
  optica: Optica;
  observacoes: string;
  takes: Take[];
}

/** Bloco / Letra / Unidade dentro de uma cena. */
export interface Bloco {
  id: string;
  letra: string;
  planos: Plano[];
}

/** Cena — accordion principal. Contém blocos. */
export interface Cena {
  id: string;
  numero: string;
  blocos: Bloco[];
}

/** Câmera cadastrada no boletim (multicam real). */
export interface CameraCadastrada {
  id: string;
  nomeId: string;
  modelo: string;
  operador: string;
  foco: string;
  claquetista: string;
}

/** Bloco de Produção. */
export interface Producao {
  produtora: string;
  tituloProjeto: string;
  diretor: string;
  diretorFotografia: string;
  data: string;
  diaDiaria: string;
}

/** Item da lista de mídia / suporte (inventário do dia). */
export interface MidiaSuporte {
  id: string;
  tipoMidia: string;
  numeroCartao: string;
  quantidade: string;
  responsavel: string;
}

/** Resumo das cenas do dia. */
export interface CenasDoDia {
  cenasRealizadas: string;
  totalTakes: string;
  tomadasAprovadas: string;
  continuidade: string;
}

/** Controle de horários (almoço com início/fim separados). */
export interface Horarios {
  inicio: string;
  fim: string;
  almocoInicio: string;
  almocoFim: string;
  /** Legado v1 (string única "14:00–15:00") — mantido p/ fallback de exibição. */
  almoco: string;
  totalHoras: string;
  horaExtra: string;
}

/** Membro da equipe de câmera (lista dinâmica). */
export interface MembroEquipe {
  id: string;
  nome: string;
  funcao: string;
}

/** O boletim completo de um dia de diária. */
export interface Boletim {
  id: string;
  schemaVersion: number;
  producao: Producao;
  camerasCadastradas: CameraCadastrada[];
  cenas: Cena[];
  midiaSuporte: MidiaSuporte[];
  cenasDoDia: CenasDoDia;
  horarios: Horarios;
  equipeCamera: MembroEquipe[];
  observacoesGerais: string;
  createdAt: string;
  updatedAt: string;
}

/** Envelope usado no export/import de backup JSON. */
export interface BackupFile {
  app: 'boletim-diario-de-camera';
  schemaVersion: number;
  exportedAt: string;
  boletins: Boletim[];
}
