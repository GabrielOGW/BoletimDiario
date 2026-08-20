/**
 * O JSON da diária — o terceiro entregável da Fase 9, e o único que não é para ler.
 *
 * A folha é para o set, o CSV é para a pós, e este arquivo é para **guardar**: a diária
 * inteira, os três departamentos, num formato que uma máquina lê de volta. É o que sobra
 * quando a produção acaba, a assinatura da plataforma expira e alguém, dois anos depois,
 * precisa saber com que lente a cena 24 foi rodada.
 *
 * Três decisões que ele carrega:
 *
 * 1. **Entidades cruas, não a leitura consolidada.** A tela junta os três departamentos
 *    para o olho; o arquivo guarda o que foi anotado. Exportar o resumo seria exportar uma
 *    interpretação, e interpretação a gente refaz — dado perdido, não.
 * 2. **Sem os campos de sincronização.** `_dirty` é contabilidade do aparelho: diz que
 *    aquele registro ainda não subiu **deste** celular. Num arquivo que vai para outro
 *    lugar, ele não significa nada e só faria alguém tirar conclusão errada.
 * 3. **Gerado no cliente, do banco local.** Como tudo na superfície de diária: exportar no
 *    fim do dia não pode depender de sinal (ADR-016).
 */

import type {
  LocalCameraTakeData,
  LocalCameraUnit,
  LocalContinuityTakeData,
  LocalDailyProgressReport,
  LocalRecord,
  LocalScene,
  LocalSetup,
  LocalSoundDayConfig,
  LocalSoundTakeData,
  LocalSoundTakeTrack,
  LocalTake,
} from '@/lib/offline/db';

import type { EquipamentoDaDiaria } from './equipamentos';

/**
 * Versão do formato do arquivo, não do schema do banco.
 *
 * Sobe quando um campo **sai** ou muda de significado — acrescentar campo não quebra
 * ninguém que já lê o arquivo. É o mesmo contrato do backup do boletim local.
 */
export const EXPORT_SCHEMA_VERSION = 1;

/** O cabeçalho da diária, como veio da sala (ADR-016). */
export interface CabecalhoExportado {
  producao: {
    name: string;
    company: string | null;
    director: string | null;
    dop: string | null;
  };
  diaria: {
    date: string;
    dayNumber: string | null;
    callTime: string | null;
    wrapTime: string | null;
    lunchStart: string | null;
    lunchEnd: string | null;
    location: string | null;
    unit: string | null;
    notes: string | null;
  };
  equipe: { id: string; nome: string; funcao: string }[];
  equipamentos?: EquipamentoDaDiaria[];
}

export interface FonteExportacao {
  cabecalho: CabecalhoExportado;
  cenas: LocalScene[];
  setups: LocalSetup[];
  takes: LocalTake[];
  cameras: LocalCameraUnit[];
  camera: LocalCameraTakeData[];
  somConfig?: LocalSoundDayConfig | null;
  som: LocalSoundTakeData[];
  somTracks: LocalSoundTakeTrack[];
  continuidade: LocalContinuityTakeData[];
  /**
   * As quatro coleções de estado do set chegam como união de tipos (`listEstado` serve as
   * quatro pela mesma consulta). Aqui interessa o que elas têm em comum — id, versão e o
   * resto vai inteiro para o arquivo.
   */
  props: LocalRecord[];
  figurino: LocalRecord[];
  cabeloMaquiagem: LocalRecord[];
  cenografia: LocalRecord[];
  relatorio?: LocalDailyProgressReport | null;
}

export interface DiariaExportada {
  app: 'boletim-audiovisual';
  schemaVersion: number;
  exportedAt: string;
  producao: CabecalhoExportado['producao'];
  diaria: CabecalhoExportado['diaria'];
  equipe: CabecalhoExportado['equipe'];
  equipamentos: EquipamentoDaDiaria[];
  cenas: unknown[];
  setups: unknown[];
  takes: unknown[];
  camera: { unidades: unknown[]; takes: unknown[] };
  som: { configuracao: unknown | null; takes: unknown[]; tracks: unknown[] };
  continuidade: {
    takes: unknown[];
    props: unknown[];
    figurino: unknown[];
    cabeloMaquiagem: unknown[];
    cenografia: unknown[];
    relatorioDeProgresso: unknown | null;
  };
  /** Contagens para conferir o arquivo sem abri-lo inteiro. */
  totais: { cenas: number; planos: number; takes: number };
}

/** Tira o que só faz sentido dentro deste aparelho. `version` fica: ela é do servidor. */
function limpo<T extends LocalRecord>(registro: T): Record<string, unknown> {
  const { _dirty: _ignorado, ...resto } = registro;
  return { ...resto };
}

const limpaLista = (registros: LocalRecord[]) => registros.map(limpo);

/**
 * A diária inteira, pronta para virar arquivo.
 *
 * `exportedAt` entra por parâmetro para o teste poder comparar o objeto inteiro — uma data
 * gerada aqui dentro tornaria o resultado impossível de afirmar.
 */
export function exportaDiaria(
  fonte: FonteExportacao,
  exportedAt: string,
): DiariaExportada {
  return {
    app: 'boletim-audiovisual',
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt,
    producao: fonte.cabecalho.producao,
    diaria: fonte.cabecalho.diaria,
    equipe: fonte.cabecalho.equipe,
    equipamentos: fonte.cabecalho.equipamentos ?? [],
    cenas: limpaLista(fonte.cenas),
    setups: limpaLista(fonte.setups),
    takes: limpaLista(fonte.takes),
    camera: {
      unidades: limpaLista(fonte.cameras),
      takes: limpaLista(fonte.camera),
    },
    som: {
      configuracao: fonte.somConfig ? limpo(fonte.somConfig) : null,
      takes: limpaLista(fonte.som),
      tracks: limpaLista(fonte.somTracks),
    },
    continuidade: {
      takes: limpaLista(fonte.continuidade),
      props: limpaLista(fonte.props),
      figurino: limpaLista(fonte.figurino),
      cabeloMaquiagem: limpaLista(fonte.cabeloMaquiagem),
      cenografia: limpaLista(fonte.cenografia),
      relatorioDeProgresso: fonte.relatorio ? limpo(fonte.relatorio) : null,
    },
    totais: {
      cenas: fonte.cenas.length,
      planos: fonte.setups.length,
      takes: fonte.takes.length,
    },
  };
}

/** `Projeto X` + `2026-08-19` → `diaria-projeto-x-2026-08-19.json`. */
export function nomeDoArquivo(projeto: string, data: string): string {
  const nome = projeto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `diaria-${nome || 'sem-titulo'}-${data}.json`;
}
