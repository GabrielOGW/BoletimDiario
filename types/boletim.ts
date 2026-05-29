/**
 * Modelo de domínio do Boletim Diário de Câmera.
 *
 * Tudo é serializável em JSON (apenas strings/booleans/arrays) para persistir
 * direto no LocalStorage e permitir export/import de backup sem transformação.
 */

/** Versão do schema persistido — usada para migrações futuras de backup. */
export const SCHEMA_VERSION = 1 as const;

/** Um take individual dentro de uma cena. */
export interface Take {
  id: string;
  numero: string;
  observacao: string;
  /** Requisito principal: marcado quando o diretor aprova o take. */
  aprovado: boolean;
}

/** Configurações técnicas de captação de uma cena. */
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

/** Óptica usada na cena. */
export interface Optica {
  lentes: string;
  filtros: string;
  matteBox: boolean;
}

/** Card expansível — o módulo central do boletim. */
export interface Cena {
  id: string;
  numeroNome: string;
  tecnica: ConfiguracoesTecnicas;
  optica: Optica;
  cartaoRolo: string;
  observacoes: string;
  takes: Take[];
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

/** Bloco de Câmera. */
export interface Camera {
  numeroId: string;
  modelo: string;
  operador: string;
  foco: string;
  claquetista: string;
}

/** Item da lista de mídia / suporte. */
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

/** Controle de horários. */
export interface Horarios {
  inicio: string;
  fim: string;
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
  camera: Camera;
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
