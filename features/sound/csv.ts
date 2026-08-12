/**
 * O CSV do sound report — o entregável prioritário do módulo (sound.md §6).
 *
 * É o arquivo que a pós consome para conformar áudio, e por isso ele é gerado do **mesmo**
 * `linhasDoRelatorio()` que desenha a tela e a folha: três leituras diferentes da diária
 * seriam três verdades diferentes sobre o mesmo dia.
 *
 * Sem biblioteca — o app não tem dependência de runtime para isso (ADR-008), e um CSV é
 * separador, aspas e fim de linha. O que exige cuidado não é gerar: é gerar de um jeito
 * que **abra do outro lado**, e essa parte está nas escolhas comentadas abaixo.
 */

import type { LinhaSom } from './estrutura';

/**
 * Mínimo de colunas de track.
 *
 * O cabeçalho precisa ser estável entre diárias (§6): a pós monta o template dela uma vez.
 * Quatro é o layout clássico, e uma diária que usou três não pode deslocar as colunas de
 * quem espera quatro. Passando disso, o cabeçalho cresce — o limite de 4 é do caderno de
 * papel, não do domínio (§11).
 */
const TRACKS_MINIMAS = 4;

/** As colunas fixas, na ordem em que a pós as lê. */
const COLUNAS = [
  'projeto',
  'data',
  'cena',
  'bloco',
  'plano',
  'take',
  'roll',
  'arquivo',
  'tc_inicio',
  'tc_fim',
  'duracao_seg',
  'circled',
  'natureza',
  'julgamento',
  'motivo_ng',
  'nota',
] as const;

export interface ContextoCSV {
  projeto: string;
  /** A data da diária como ela é: dia civil `YYYY-MM-DD`, não instante (R9). */
  data: string;
}

/**
 * Aspas só quando precisa, e sempre pela regra do RFC 4180.
 *
 * O ponto e vírgula entra na lista porque o Excel em pt-BR o trata como separador ao
 * reabrir o arquivo — uma nota de som com "avião; helicóptero" quebraria a linha inteira
 * no computador de quem recebe.
 */
function campo(valor: string | number | null | undefined): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[",;\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

const simNao = (valor: boolean) => (valor ? 'sim' : 'não');

/** "Boom · MKH 416" — nome e fonte da track numa célula só. */
function celulaDeTrack(track: { nome: string; fonte: string } | undefined): string {
  if (!track) return '';
  return [track.nome, track.fonte].filter(Boolean).join(' · ');
}

/** Quantas colunas de track o arquivo terá. */
export function colunasDeTrack(linhas: LinhaSom[]): number {
  const maior = linhas.reduce(
    (maximo, linha) =>
      linha.tracks.reduce((atual, track) => Math.max(atual, track.index), maximo),
    0,
  );
  return Math.max(maior, TRACKS_MINIMAS);
}

/**
 * O arquivo inteiro, como texto.
 *
 * `\r\n` por RFC 4180: é o que faz a planilha abrir igual no Windows, no Mac e no Sheets.
 * O BOM é acrescentado na hora de baixar, não aqui — quem testa compara texto.
 */
export function montaCSV(linhas: LinhaSom[], contexto: ContextoCSV): string {
  const totalTracks = colunasDeTrack(linhas);

  const cabecalho = [
    ...COLUNAS,
    ...Array.from({ length: totalTracks }, (_, i) => `track_${i + 1}`),
  ];

  const corpo = linhas.map((linha) => {
    const porIndice = new Map(linha.tracks.map((track) => [track.index, track]));

    return [
      contexto.projeto,
      contexto.data,
      linha.cena,
      linha.bloco,
      linha.plano,
      linha.take,
      linha.roll,
      linha.arquivo,
      linha.tcInicio,
      linha.tcFim,
      linha.duracaoSeg,
      simNao(linha.circled),
      // A natureza vazia é o take normal. Escrevemos "Sync" no arquivo — na planilha, uma
      // célula em branco lê-se como "ninguém preencheu", que é outra coisa.
      linha.natureza ?? 'Sync',
      linha.julgamento ?? '',
      linha.motivoNG,
      linha.nota,
      ...Array.from({ length: totalTracks }, (_, i) =>
        celulaDeTrack(porIndice.get(i + 1)),
      ),
    ]
      .map(campo)
      .join(',');
  });

  return [cabecalho.join(','), ...corpo].join('\r\n');
}

/** `Projeto X` + `2026-08-11` → `som-projeto-x-2026-08-11.csv`. */
export function nomeDoArquivo(contexto: ContextoCSV): string {
  const projeto = contexto.projeto
    .normalize('NFD')
    // Classe nomeada em vez da faixa de combinantes: acento escrito à mão no fonte é
    // invisível no editor e some numa conversão de encoding descuidada.
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `som-${projeto || 'diaria'}-${contexto.data}.csv`;
}
