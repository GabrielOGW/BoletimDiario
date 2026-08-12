/**
 * Páginas de roteiro em **oitavos** — a convenção do setor.
 *
 * Uma página vale 8/8, e a cobertura do dia se mede em frações dela: "2 4/8" são duas
 * páginas e meia, e o relatório de progresso precisa **somar** isso
 * ([features/continuity.md §7](../../docs/features/continuity.md#7-o-que-a-prática-exige--levantamento)).
 *
 * Puro, sem I/O — como todo o resto de `domain/platform/` (ADR-013). Mora aqui, e não no
 * módulo de Continuidade, porque quem soma é o relatório e quem escreve é a cena: dois
 * lugares, uma regra.
 *
 * **Por que isto é função e não coluna:** guardar o inteiro ao lado do texto seria um
 * cache do próprio dado ao lado dele, e cache do que está na linha de cima envelhece
 * calado — bastaria alguém editar `page` por um caminho que esquecesse de recalcular
 * (ADR-034). A soma acontece uma vez por dia, sobre algumas dezenas de cenas.
 */

/** Oitavos por página. Não é constante mágica: é a convenção. */
export const OITAVOS_POR_PAGINA = 8;

/**
 * `"2 4/8"` → `20`. `"5/8"` → `5`. `"3"` → `24`. `""` → `null`.
 *
 * `null` e `0` são **coisas diferentes** e é por isso que o retorno é anulável: "meia
 * página" digitado por extenso não vale zero oitavo, vale "não deu para somar". Um zero
 * silencioso viraria um total errado com cara de certo, que é o pior resultado possível
 * num relatório que a produção lê no fim do dia.
 */
export function paginaEmOitavos(valor: string | null | undefined): number | null {
  const texto = String(valor ?? '')
    .trim()
    .replace(',', '.');
  if (!texto) return null;

  // "2 4/8" — inteiro e fração
  const mista = texto.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mista) {
    const [, inteiro, numerador, denominador] = mista;
    if (Number(denominador) === 0) return null;
    return (
      Number(inteiro) * OITAVOS_POR_PAGINA +
      (Number(numerador) * OITAVOS_POR_PAGINA) / Number(denominador)
    );
  }

  // "5/8" — só fração
  const fracao = texto.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fracao) {
    const [, numerador, denominador] = fracao;
    if (Number(denominador) === 0) return null;
    return (Number(numerador) * OITAVOS_POR_PAGINA) / Number(denominador);
  }

  // "3" ou "2.5" — páginas inteiras ou decimais
  const numero = texto.match(/^\d+(\.\d+)?$/);
  if (numero) return Number(texto) * OITAVOS_POR_PAGINA;

  return null;
}

/**
 * `20` → `"2 4/8"`. `5` → `"5/8"`. `16` → `"2"`. `0` → `"0"`.
 *
 * De volta ao formato que se escreve à mão, porque é o que sai impresso e é o que a
 * produção sabe ler.
 */
export function oitavosEmPagina(oitavos: number): string {
  const total = Math.max(0, Math.round(oitavos));
  const paginas = Math.floor(total / OITAVOS_POR_PAGINA);
  const resto = total % OITAVOS_POR_PAGINA;

  if (paginas === 0 && resto === 0) return '0';
  if (resto === 0) return String(paginas);
  if (paginas === 0) return `${resto}/${OITAVOS_POR_PAGINA}`;
  return `${paginas} ${resto}/${OITAVOS_POR_PAGINA}`;
}

export interface SomaDePaginas {
  /** Total em oitavos do que deu para somar. */
  oitavos: number;
  /** O total já formatado — "2 4/8". */
  formatado: string;
  /** Quantos valores foram somados. */
  somados: number;
  /**
   * Os valores que **não** deram para somar, como foram escritos.
   *
   * Devolvidos, e não descartados: o relatório mostra "2 4/8 (+ 1 sem soma: 'meia')" em
   * vez de fingir um total completo. Errar para menos em silêncio é pior que admitir.
   */
  naoSomados: string[];
}

export function somaPaginas(valores: (string | null | undefined)[]): SomaDePaginas {
  let oitavos = 0;
  let somados = 0;
  const naoSomados: string[] = [];

  for (const valor of valores) {
    const texto = String(valor ?? '').trim();
    if (!texto) continue;

    const parcial = paginaEmOitavos(texto);
    if (parcial === null) {
      naoSomados.push(texto);
      continue;
    }

    oitavos += parcial;
    somados += 1;
  }

  return { oitavos, formatado: oitavosEmPagina(oitavos), somados, naoSomados };
}
