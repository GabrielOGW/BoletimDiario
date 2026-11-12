/**
 * A estrutura do Boletim de Som, sem React.
 *
 * Mesmo papel de `features/camera/estrutura.ts`: a **tela**, a **folha impressa** e o
 * **CSV** leem os mesmos dados do mesmo jeito. Aqui a duplicação seria ainda mais cara que
 * na câmera — o CSV é o arquivo que a pós usa para conformar áudio, e um sound report que
 * lista os takes numa ordem e exporta noutra é pior que um sound report que não existe.
 *
 * Sem React e sem Dexie de propósito (só `import type`): é o que permite testar a leitura
 * da diária inteira com `node --experimental-strip-types`.
 */

import { TAKE_KIND_LABEL, TAKE_STATUS_LABEL } from '@/domain/platform/enums';
import type {
  LocalScene,
  LocalSetup,
  LocalSoundRoll,
  LocalSoundTakeData,
  LocalSoundTakeTrack,
  LocalTake,
} from '@/lib/offline/db';

import { agrupaCenas } from '@/features/diaria/cenas';

import { rotulosDosProblemas } from './problemas';

export interface TrackDaLinha {
  index: number;
  nome: string;
  /** O microfone do canal (`source`). */
  fonte: string;
  /** Tipo de captação — Boom, Lapela, Ambiente… (ADR-041). Vazio quando não marcado. */
  captacao?: string;
}

/** Uma linha do sound report — um take, com o que o Som escreveu nele. */
export interface LinhaSom {
  takeId: string;
  cena: string;
  bloco: string;
  plano: string;
  take: number;
  /** Rótulo da natureza, `null` quando é o take normal (ADR-029). */
  natureza: string | null;
  /** Rótulo do julgamento do Som, `null` quando não há um que valha imprimir. */
  julgamento: string | null;
  circled: boolean;
  /** Rodado sem som — a resposta que o editor vem procurar (ADR-029). */
  mos: boolean;
  roll: string;
  arquivo: string;
  tcInicio: string;
  tcFim: string;
  duracaoSeg: number | null;
  motivoNG: string;
  nota: string;
  /** Problemas marcados, já em rótulo (ADR-041). */
  problemas: string[];
  /** O detalhe livre dos problemas — "avião aos 20 s; lav do João raspando". */
  obsProblemas: string;
  tracks: TrackDaLinha[];
  /** `true` quando o Som ainda não escreveu nada neste take. */
  semDados: boolean;
}

export interface FonteDoRelatorio {
  cenas: LocalScene[];
  setups: LocalSetup[];
  takes: LocalTake[];
  dados: LocalSoundTakeData[];
  tracks: LocalSoundTakeTrack[];
}

const texto = (valor: unknown): string => String(valor ?? '').trim();

/**
 * A natureza do take, quando não é a padrão.
 *
 * `SYNC` não é impresso: é o que quase todo take é, e repeti-lo em cada linha afastaria o
 * olho justamente de `MOS`, `WILD` e `PLAYBACK` — as linhas que alguém abre o relatório
 * para encontrar. Mesma regra que a câmera aplica ao tipo do plano.
 */
export function rotuloDaNatureza(kind: string | null | undefined): string | null {
  const valor = texto(kind);
  if (!valor || valor === 'SYNC') return null;
  return TAKE_KIND_LABEL[valor as keyof typeof TAKE_KIND_LABEL] ?? valor;
}

/**
 * O julgamento **do Som** sobre o take (ADR-010).
 *
 * `RECORDED` é o padrão e não vira marca. `CIRCLE` também não: o circled já tem coluna
 * própria, e a mesma informação com dois nomes na mesma linha só confunde.
 */
export function rotuloDoJulgamento(status: string | null | undefined): string | null {
  const valor = texto(status);
  if (!valor || valor === 'RECORDED' || valor === 'CIRCLE') return null;
  return TAKE_STATUS_LABEL[valor as keyof typeof TAKE_STATUS_LABEL] ?? valor;
}

/** "1 Boom · 2 João" — o resumo dobrado que a tela mostra sem abrir as tracks. */
export function resumoDeTracks(tracks: TrackDaLinha[]): string {
  return tracks
    .map((track) =>
      [String(track.index), track.nome || track.fonte].filter(Boolean).join(' '),
    )
    .join(' · ');
}

/**
 * A diária inteira, na ordem em que ela é lida: cena, bloco, plano, take.
 *
 * **Todo take entra**, mesmo sem `SoundTakeData`. Omitir os que o Som não preencheu
 * reintroduziria pela porta dos fundos a ambiguidade que ADR-029 fechou: a linha ausente
 * não distingue "foi MOS" de "o som ainda não anotou". Aqui MOS é uma linha marcada, e o
 * take não preenchido é uma linha vazia — dois fatos diferentes, visíveis como tal.
 */
export function linhasDoRelatorio({
  cenas,
  setups,
  takes,
  dados,
  tracks,
}: FonteDoRelatorio): LinhaSom[] {
  const dadosPorTake = new Map(dados.map((linha) => [linha.takeId, linha]));

  const tracksPorTake = new Map<string, TrackDaLinha[]>();
  for (const track of [...tracks].sort((a, b) => a.index - b.index)) {
    const lista = tracksPorTake.get(track.takeId) ?? [];
    lista.push({
      index: track.index,
      nome: texto(track.name),
      fonte: texto(track.source),
      captacao: texto(track.pickup),
    });
    tracksPorTake.set(track.takeId, lista);
  }

  const linhas: LinhaSom[] = [];

  for (const cena of agrupaCenas(cenas)) {
    for (const bloco of cena.blocos) {
      const planos = setups
        .filter((setup) => setup.sceneId === bloco.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));

      for (const plano of planos) {
        const takesDoPlano = takes
          .filter((take) => take.setupId === plano.id)
          .sort((a, b) => a.number - b.number);

        for (const take of takesDoPlano) {
          const som = dadosPorTake.get(take.id);

          linhas.push({
            takeId: take.id,
            cena: cena.numero,
            bloco: texto(bloco.block),
            plano: texto(plano.code),
            take: take.number,
            natureza: rotuloDaNatureza(take.kind),
            julgamento: rotuloDoJulgamento(som?.status),
            circled: som?.circled ?? false,
            mos: texto(take.kind) === 'MOS',
            roll: texto(som?.soundRoll),
            arquivo: texto(som?.fileName),
            tcInicio: texto(som?.tcStart),
            tcFim: texto(som?.tcEnd),
            duracaoSeg: som?.durationSec ?? null,
            motivoNG: texto(som?.ngReason),
            nota: texto(som?.notes),
            problemas: rotulosDosProblemas(som?.issues),
            obsProblemas: texto(som?.issueNotes),
            tracks: tracksPorTake.get(take.id) ?? [],
            semDados: !som,
          });
        }
      }
    }
  }

  return linhas;
}

export interface ResumoDoDia {
  takes: number;
  comSom: number;
  circled: number;
  mos: number;
  ng: number;
  /** Rolls distintos do dia, na ordem em que a pós vai procurá-los. */
  rolls: string[];
  arquivos: number;
  /** Takes com algum problema marcado ou descrito (ADR-041). */
  comProblema: number;
}

/** Os números do cabeçalho — contados das linhas, para não haver dois totais na folha. */
export function resumoDoDia(linhas: LinhaSom[]): ResumoDoDia {
  const rolls = [...new Set(linhas.map((linha) => linha.roll).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }),
  );

  return {
    takes: linhas.length,
    comSom: linhas.filter((linha) => !linha.semDados && !linha.mos).length,
    circled: linhas.filter((linha) => linha.circled).length,
    mos: linhas.filter((linha) => linha.mos).length,
    ng: linhas.filter((linha) => linha.julgamento === TAKE_STATUS_LABEL.NG).length,
    rolls,
    arquivos: new Set(linhas.map((linha) => linha.arquivo).filter(Boolean)).size,
    comProblema: linhas.filter(temProblema).length,
  };
}

export const temProblema = (linha: LinhaSom) =>
  linha.problemas.length > 0 || linha.obsProblemas !== '';

// ---- Rolos / cartões (ADR-041) ----

export interface RoloDoDia {
  rotulo: string;
  /** `null` quando o roll só aparece nos takes, sem cadastro — ainda assim é listado. */
  id: string | null;
  midia: string;
  gravador: string;
  nota: string;
  /** Os arquivos do roll, na ordem da diária — derivados dos takes, nunca guardados. */
  arquivos: LinhaSom[];
}

const porRotulo = (a: string, b: string) =>
  a.localeCompare(b, 'pt-BR', { numeric: true });

/**
 * Os rolos do dia: o que foi **cadastrado** unido ao que os **takes** dizem.
 *
 * As duas fontes, e não só o cadastro: o mixer anota o roll no take o dia inteiro e
 * cadastra o cartão quando dá — um roll sem cadastro continua sendo um roll com arquivos,
 * e sumir com ele do relatório seria esconder material da pós. Um cadastrado sem arquivo
 * também entra: "cartão 3 formatado e não usado" é informação de custódia.
 */
export function rolosDoDia(linhas: LinhaSom[], rolls: LocalSoundRoll[]): RoloDoDia[] {
  const mapa = new Map<string, RoloDoDia>();
  const chave = (rotulo: string) => rotulo.trim().toUpperCase();

  for (const roll of rolls) {
    const rotulo = texto(roll.label);
    if (!rotulo) continue;
    mapa.set(chave(rotulo), {
      rotulo,
      id: roll.id,
      midia: texto(roll.media),
      gravador: texto(roll.recorder),
      nota: texto(roll.notes),
      arquivos: [],
    });
  }

  for (const linha of linhas) {
    if (!linha.roll) continue;
    const k = chave(linha.roll);
    const rolo =
      mapa.get(k) ??
      ({
        rotulo: linha.roll,
        id: null,
        midia: '',
        gravador: '',
        nota: '',
        arquivos: [],
      } satisfies RoloDoDia);
    rolo.arquivos.push(linha);
    mapa.set(k, rolo);
  }

  return [...mapa.values()].sort((a, b) => porRotulo(a.rotulo, b.rotulo));
}

// ---- Distribuição de canais (ADR-041) ----

export interface CanalDoDia {
  index: number;
  nome: string;
  microfone: string;
  captacao: string;
  /** Em quantos takes este canal teve exatamente esta configuração. */
  takes: number;
}

/**
 * A distribuição de canais e microfones do dia — o quadro que a pós de áudio quer ver
 * antes de abrir o primeiro arquivo.
 *
 * Uma linha por **configuração distinta** de cada canal, não por take: como o layout é
 * herdado (ADR-033), o dia inteiro costuma ter três ou quatro linhas aqui, e é a troca
 * — "a partir da cena 31 o canal 3 virou a lapela da Maria" — que salta aos olhos.
 */
export function canaisDoDia(linhas: LinhaSom[]): CanalDoDia[] {
  const mapa = new Map<string, CanalDoDia>();

  for (const linha of linhas) {
    for (const track of linha.tracks) {
      const canal = {
        index: track.index,
        nome: track.nome,
        microfone: track.fonte,
        captacao: track.captacao ?? '',
      };
      if (!canal.nome && !canal.microfone && !canal.captacao) continue;
      const k = [canal.index, canal.nome, canal.microfone, canal.captacao].join('\u0000');
      const atual = mapa.get(k);
      if (atual) atual.takes += 1;
      else mapa.set(k, { ...canal, takes: 1 });
    }
  }

  return [...mapa.values()].sort(
    (a, b) => a.index - b.index || b.takes - a.takes || a.nome.localeCompare(b.nome),
  );
}
