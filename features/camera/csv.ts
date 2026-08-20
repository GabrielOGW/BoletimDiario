/**
 * O CSV do boletim de câmera — o entregável da Fase 9 para a pós.
 *
 * O sound report já tinha o dele (`features/sound/csv.ts`), e este é o par: o que a
 * montagem e a finalização precisam para achar um clip sem abrir o boletim em PDF e ler
 * com o dedo. Mesma abordagem, de propósito — separador, aspas e fim de linha, sem
 * biblioteca (ADR-008) — e as mesmas escolhas de compatibilidade, porque o arquivo abre
 * nos mesmos computadores.
 *
 * As colunas técnicas **não são declaradas aqui**: saem de `CAMPOS_TECNICOS`, a mesma
 * lista que desenha a linha do plano na tela e na folha. Acrescentar um campo técnico ao
 * módulo passa a dar a coluna de graça, e não existe a segunda lista que ficaria para trás.
 */

import { CAMPOS_TECNICOS, type LinhaCamera } from './estrutura';

/** As colunas de identificação, na ordem em que a pós lê uma planilha de câmera. */
const COLUNAS_INICIAIS = [
  'projeto',
  'data',
  'cena',
  'bloco',
  'plano',
  'tipo',
  'take',
  'camera',
  'arquivo',
  'cartao',
  'roll',
  'volume',
] as const;

/** O que fecha a linha: julgamento, duração e o que foi escrito à mão. */
const COLUNAS_FINAIS = [
  'matte_box',
  'natureza',
  'julgamento',
  'motivo_ng',
  'aprovado',
  'duracao_seg',
  'nota',
  'nota_midia',
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
 * reabrir o arquivo — uma nota de câmera com "estourou; refazer" quebraria a linha inteira
 * no computador de quem recebe. Mesma função do CSV de som, mesma razão.
 */
function campo(valor: string | number | boolean | null | undefined): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[",;\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

const simNao = (valor: boolean) => (valor ? 'sim' : 'não');

/** O cabeçalho do arquivo — estável entre diárias, para a pós montar o template uma vez. */
export function colunasDoCSV(): string[] {
  return [
    ...COLUNAS_INICIAIS,
    ...CAMPOS_TECNICOS.map(({ coluna }) => coluna),
    ...COLUNAS_FINAIS,
  ];
}

/**
 * O arquivo inteiro, como texto.
 *
 * `\r\n` por RFC 4180: é o que faz a planilha abrir igual no Windows, no Mac e no Sheets.
 * O BOM é acrescentado na hora de baixar, não aqui — quem testa compara texto.
 */
export function montaCSV(linhas: LinhaCamera[], contexto: ContextoCSV): string {
  const corpo = linhas.map((linha) =>
    [
      contexto.projeto,
      contexto.data,
      linha.cena,
      linha.bloco,
      linha.plano,
      linha.tipo,
      linha.take,
      linha.camera,
      linha.arquivo,
      linha.cartao,
      linha.roll,
      linha.volume,
      ...CAMPOS_TECNICOS.map(({ coluna }) => linha.tecnica[coluna] ?? ''),
      simNao(linha.matteBox),
      // A natureza vazia é o take normal. Escrevemos "Sync" no arquivo — na planilha, uma
      // célula em branco lê-se como "ninguém preencheu", que é outra coisa.
      linha.natureza || 'Sync',
      linha.julgamento,
      linha.motivoNG,
      simNao(linha.aprovado),
      linha.duracaoSeg ?? '',
      linha.nota,
      linha.notaMidia,
    ]
      .map(campo)
      .join(','),
  );

  return [colunasDoCSV().join(','), ...corpo].join('\r\n');
}

/** `Projeto X` + `2026-08-19` → `camera-projeto-x-2026-08-19.csv`. */
export function nomeDoArquivo(contexto: ContextoCSV): string {
  const projeto = contexto.projeto
    .normalize('NFD')
    // Classe nomeada em vez da faixa de combinantes: acento escrito à mão no fonte é
    // invisível no editor e some numa conversão de encoding descuidada.
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `camera-${projeto || 'diaria'}-${contexto.data}.csv`;
}
