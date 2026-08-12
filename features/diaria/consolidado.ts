/**
 * A diária vista pelos três departamentos ao mesmo tempo, sem React.
 *
 * É o que a plataforma existe para entregar: um take, três departamentos, **relacionados
 * por `take_id`** — não por conciliação. O editor abre isto para saber que arquivo de som
 * casa com que clip de câmera, e a resposta é uma junção, não um trabalho.
 *
 * ```
 * Take 12
 *   Câmera:  Card A023 · A023C012_001
 *   Som:     Roll 008  · 008_012
 *   TC:      10:42:13:05
 * ```
 *
 * Sem React e sem Dexie (só `import type`): testável com type-stripping do Node.
 */

import { TAKE_KIND_LABEL, TAKE_STATUS_LABEL } from '@/domain/platform/enums';
import type {
  LocalCameraTakeData,
  LocalCameraUnit,
  LocalContinuityTakeData,
  LocalScene,
  LocalSetup,
  LocalSoundTakeData,
  LocalTake,
} from '@/lib/offline/db';

import { agrupaCenas } from './cenas';

const texto = (valor: unknown): string => String(valor ?? '').trim();

const rotulo = (
  mapa: Record<string, string>,
  valor: string | null | undefined,
): string => {
  const chave = texto(valor);
  return chave ? (mapa[chave] ?? chave) : '';
};

/** O que um departamento tem a dizer sobre o take, resumido em campos comparáveis. */
export interface ColunaDoTake {
  /** `true` quando aquele departamento anotou alguma coisa neste take. */
  anotou: boolean;
  /** O identificador do arquivo — clip da câmera, arquivo do som. */
  arquivo: string;
  /** Cartão, roll — o que localiza a mídia. */
  midia: string;
  /** Julgamento daquele departamento, quando há um. */
  julgamento: string;
  /** Selo positivo: aprovado, circled, print. */
  destaque: boolean;
  /** A observação do departamento. */
  nota: string;
}

export interface LinhaConsolidada {
  takeId: string;
  cena: string;
  bloco: string;
  plano: string;
  take: number;
  /** Natureza do take compartilhado — vazio quando é o take normal (ADR-029). */
  natureza: string;
  mos: boolean;
  camera: ColunaDoTake;
  som: ColunaDoTake;
  continuidade: ColunaDoTake;
  /**
   * Tudo o que a linha contém, em minúsculas, para o filtro da tela.
   *
   * Pré-calculado aqui, e não montado a cada tecla: a diária grande tem centenas de takes
   * e o filtro roda a cada letra digitada, com o dedo esperando.
   */
  busca: string;
}

export interface FonteConsolidada {
  cenas: LocalScene[];
  setups: LocalSetup[];
  takes: LocalTake[];
  camera: LocalCameraTakeData[];
  cameras: LocalCameraUnit[];
  som: LocalSoundTakeData[];
  continuidade: LocalContinuityTakeData[];
}

const VAZIA: ColunaDoTake = {
  anotou: false,
  arquivo: '',
  midia: '',
  julgamento: '',
  destaque: false,
  nota: '',
};

export function linhasConsolidadas({
  cenas,
  setups,
  takes,
  camera,
  cameras,
  som,
  continuidade,
}: FonteConsolidada): LinhaConsolidada[] {
  /**
   * Câmera é a única com **mais de uma linha por take** — é multicam de verdade.
   *
   * As linhas são juntadas em uma coluna só, com o rótulo da câmera na frente de cada
   * arquivo: mostrar só a primeira esconderia metade do material de um take de duas
   * câmeras, que é exatamente o dado que a pós vem procurar aqui.
   */
  const cameraPorTake = new Map<string, LocalCameraTakeData[]>();
  for (const linha of camera) {
    cameraPorTake.set(linha.takeId, [...(cameraPorTake.get(linha.takeId) ?? []), linha]);
  }

  const etiqueta = new Map(cameras.map((unidade) => [unidade.id, unidade.label]));
  const somPorTake = new Map(som.map((linha) => [linha.takeId, linha]));
  const continuidadePorTake = new Map(continuidade.map((linha) => [linha.takeId, linha]));

  const linhas: LinhaConsolidada[] = [];

  for (const cena of agrupaCenas(cenas)) {
    for (const bloco of cena.blocos) {
      const planos = setups
        .filter((setup) => setup.sceneId === bloco.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));

      for (const plano of planos) {
        for (const take of takes
          .filter((item) => item.setupId === plano.id)
          .sort((a, b) => a.number - b.number)) {
          const dadosCamera = cameraPorTake.get(take.id) ?? [];
          const dadosSom = somPorTake.get(take.id);
          const dadosContinuidade = continuidadePorTake.get(take.id);

          const colunaCamera: ColunaDoTake =
            dadosCamera.length === 0
              ? VAZIA
              : {
                  anotou: true,
                  arquivo: dadosCamera
                    .map((linha) =>
                      [etiqueta.get(texto(linha.cameraUnitId)), texto(linha.fileName)]
                        .filter(Boolean)
                        .join(' '),
                    )
                    .filter(Boolean)
                    .join(' · '),
                  midia: [
                    ...new Set(
                      dadosCamera.flatMap((linha) =>
                        [texto(linha.card), texto(linha.roll)].filter(Boolean),
                      ),
                    ),
                  ].join(' · '),
                  julgamento: rotulo(TAKE_STATUS_LABEL, dadosCamera[0]?.status),
                  destaque: dadosCamera.some((linha) => linha.approved),
                  nota: dadosCamera
                    .map((linha) => texto(linha.notes))
                    .filter(Boolean)
                    .join(' · '),
                };

          const colunaSom: ColunaDoTake = !dadosSom
            ? VAZIA
            : {
                anotou: true,
                arquivo: texto(dadosSom.fileName),
                midia: texto(dadosSom.soundRoll),
                julgamento: rotulo(TAKE_STATUS_LABEL, dadosSom.status),
                destaque: dadosSom.circled ?? false,
                nota: [texto(dadosSom.ngReason), texto(dadosSom.notes)]
                  .filter(Boolean)
                  .join(' · '),
              };

          const colunaContinuidade: ColunaDoTake = !dadosContinuidade
            ? VAZIA
            : {
                anotou: true,
                arquivo: '',
                midia: '',
                julgamento: rotulo(TAKE_STATUS_LABEL, dadosContinuidade.status),
                destaque: dadosContinuidade.selected ?? false,
                nota: [
                  texto(dadosContinuidade.ngReason),
                  texto(dadosContinuidade.notes),
                  texto(dadosContinuidade.action),
                ]
                  .filter(Boolean)
                  .join(' · '),
              };

          const natureza =
            texto(take.kind) && take.kind !== 'SYNC'
              ? rotulo(TAKE_KIND_LABEL, take.kind)
              : '';

          linhas.push({
            takeId: take.id,
            cena: cena.numero,
            bloco: texto(bloco.block),
            plano: texto(plano.code),
            take: take.number,
            natureza,
            mos: texto(take.kind) === 'MOS',
            camera: colunaCamera,
            som: colunaSom,
            continuidade: colunaContinuidade,
            busca: [
              cena.numero,
              texto(bloco.block),
              `${cena.numero}${texto(bloco.block)}`,
              texto(plano.code),
              `take ${take.number}`,
              natureza,
              colunaCamera.arquivo,
              colunaCamera.midia,
              colunaCamera.nota,
              colunaSom.arquivo,
              colunaSom.midia,
              colunaSom.nota,
              colunaContinuidade.julgamento,
              colunaContinuidade.nota,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase(),
          });
        }
      }
    }
  }

  return linhas;
}

/**
 * Filtro por texto sobre a diária fixada.
 *
 * **Local, e não no servidor** (production-room.md §5): buscar "A012" no fim do dia, em
 * locação sem sinal, é exatamente quando isso é útil. Cada palavra do termo precisa
 * aparecer — digitar "24 boom" acha o take da cena 24 com nota de boom, e não tudo que
 * tem 24 ou boom.
 */
export function filtraLinhas(
  linhas: LinhaConsolidada[],
  termo: string,
): LinhaConsolidada[] {
  const palavras = termo.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return linhas;

  return linhas.filter((linha) =>
    palavras.every((palavra) => linha.busca.includes(palavra)),
  );
}

export interface LacunasDoDia {
  /** Takes que nenhum departamento anotou. */
  semNinguem: number;
  /** Takes com câmera e **sem** som, que não são MOS — o cruzamento mais consultado. */
  semSom: number;
  semCamera: number;
  semContinuidade: number;
}

/**
 * O que está faltando — a pergunta que a integração torna possível fazer.
 *
 * Com três cadernos separados, "que take não tem som?" só se descobre no dia seguinte, na
 * pós. Aqui é uma contagem. **MOS não é lacuna**: é um take que declaradamente não tem
 * áudio, e confundir os dois desfaria justamente o que ADR-029 resolveu.
 */
export function lacunasDoDia(linhas: LinhaConsolidada[]): LacunasDoDia {
  return {
    semNinguem: linhas.filter(
      (linha) => !linha.camera.anotou && !linha.som.anotou && !linha.continuidade.anotou,
    ).length,
    semSom: linhas.filter(
      (linha) => linha.camera.anotou && !linha.som.anotou && !linha.mos,
    ).length,
    semCamera: linhas.filter((linha) => linha.som.anotou && !linha.camera.anotou).length,
    semContinuidade: linhas.filter(
      (linha) => (linha.camera.anotou || linha.som.anotou) && !linha.continuidade.anotou,
    ).length,
  };
}
