/**
 * Cena → Bloco: a apresentação das entidades **compartilhadas**, sem React.
 *
 * Nasceu dentro de `features/camera/estrutura.ts`, que a declarava explicitamente como
 * apresentação de um módulo só. O Som provou o contrário: o agrupamento não é do Boletim
 * de Câmera, é do `Scene` compartilhado (ADR-002) — "cena 24 bloco B" é uma `Scene` só no
 * modelo e dois níveis na claquete, e isso vale igual para os três departamentos.
 *
 * Copiá-lo para cada módulo daria o pior sintoma possível: a mesma diária, aberta por dois
 * departamentos, mostrando cenas em ordens diferentes.
 */

import type { LocalScene } from '@/lib/offline/db';

export interface CenaAgrupada {
  numero: string;
  /** Os blocos daquele número — no modelo, uma `Scene` por letra (ADR-002). */
  blocos: LocalScene[];
}

/**
 * Cena e Bloco são uma `Scene` só no modelo; na tela e no papel voltam a ser dois níveis.
 *
 * É assim que a claquete fala, e mudar o vocabulário do set para agradar ao modelo seria
 * a regressão que ADR-030 proíbe.
 */
export function agrupaCenas(cenas: LocalScene[]): CenaAgrupada[] {
  const porNumero = new Map<string, LocalScene[]>();

  for (const cena of cenas) {
    const lista = porNumero.get(cena.number) ?? [];
    lista.push(cena);
    porNumero.set(cena.number, lista);
  }

  return [...porNumero.keys()]
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
    .map((numero) => ({
      numero,
      blocos: [...(porNumero.get(numero) ?? [])].sort((a, b) =>
        (a.block ?? '').localeCompare(b.block ?? ''),
      ),
    }));
}

/**
 * O código do próximo plano do bloco, quando ele nasce fora da Câmera (ADR-040).
 *
 * A Câmera numera planos em sequência dentro do bloco ("1", "2", "3"); esta função segue a
 * mesma convenção — o maior código numérico mais um — para que a Continuidade e o Som,
 * criando o plano antes da Câmera, produzam o **mesmo** código que ela produziria. Com o
 * id derivado de `(cena, diária, código)` (ADR-019), os três convergem para o mesmo
 * registro em vez de criarem "plano 3" três vezes.
 *
 * O setup de wild track (`WILD`) e códigos não numéricos ("A", "2B") não entram na conta.
 */
export function proximoCodigoDePlano(setups: readonly { code: string }[]): string {
  const numericos = setups
    .map((setup) => setup.code.trim())
    .filter((codigo) => /^\d+$/.test(codigo))
    .map(Number);
  return String(numericos.length > 0 ? Math.max(...numericos) + 1 : 1);
}
