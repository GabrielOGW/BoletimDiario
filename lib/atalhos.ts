/**
 * O caminho curto até a anotação (Fase 11).
 *
 * Do login até marcar um take eram quatro toques, todo dia: produções → produção →
 * diárias → diária → anotação. Em set isso não é incômodo de interface; é o motivo pelo
 * qual alguém volta para o caderno.
 *
 * Este módulo guarda **onde a pessoa estava** e sabe transformar isso num endereço. É
 * deliberadamente pequeno e sem dependência: ele é lido na primeira tela que abre, às
 * vezes sem rede e sempre com pressa.
 *
 * ## Por que `localStorage`, e não o Dexie nem o servidor
 *
 * - **Não é do servidor.** "Onde eu estava" é fato deste aparelho, não da produção. Duas
 *   pessoas na mesma diária estão em telas diferentes, e o continuísta que abre o celular
 *   não quer voltar para onde o assistente de câmera parou.
 * - **Não é do Dexie.** O ponteiro é lido em `/` — que é o Boletim de Câmera local
 *   (ADR-032), não conhece a camada da plataforma e precisa abrir instantaneamente. Abrir
 *   o IndexedDB para ler um objeto de seis campos custaria um await antes do primeiro
 *   pixel, na tela que mais precisa aparecer rápido.
 * - **É pequeno e descartável.** Se sumir, o pior que acontece é a pessoa navegar pelo
 *   caminho longo uma vez.
 */

const CHAVE = 'bdc:ultima-diaria:v1';

/** Onde a pessoa estava anotando pela última vez, neste aparelho. */
export interface AtalhoDeDiaria {
  productionId: string;
  shootingDayId: string;
  /** Segmento da rota: `camera`, `som`, `continuidade`, `consolidado`. */
  modulo: string;
  /** Rótulos guardados junto para a tela poder se desenhar **sem rede**. */
  producao: string;
  diaria: string;
  /** ISO de quando esteve lá — o atalho envelhece (ver `ATALHO_VALIDO_POR_DIAS`). */
  em: string;
}

/**
 * Depois de uma semana, "continuar de onde parei" deixa de ser um atalho e vira um
 * palpite: a diária acabou, a produção virou outra, e o botão levaria alguém para um dia
 * encerrado achando que é o de hoje. Some sozinho em vez de mentir.
 */
export const ATALHO_VALIDO_POR_DIAS = 7;

/** Rota de anotação de cada departamento. Quem não tem módulo vai para a diária. */
export function rotaDoDepartamento(departamento: string): string {
  if (departamento === 'CAMERA') return 'camera';
  if (departamento === 'SOUND') return 'som';
  if (departamento === 'CONTINUITY') return 'continuidade';
  // Direção, produção, DIT e os demais não anotam take: a diária é o destino certo.
  return '';
}

/** `/p/…/diarias/…/camera` — o endereço da anotação. */
export function caminhoDoAtalho(atalho: {
  productionId: string;
  shootingDayId: string;
  modulo: string;
}): string {
  const base = `/p/${atalho.productionId}/diarias/${atalho.shootingDayId}`;
  return atalho.modulo ? `${base}/${atalho.modulo}` : base;
}

function ehAtalho(valor: unknown): valor is AtalhoDeDiaria {
  if (typeof valor !== 'object' || valor === null) return false;
  const bruto = valor as Record<string, unknown>;
  return (
    typeof bruto.productionId === 'string' &&
    typeof bruto.shootingDayId === 'string' &&
    typeof bruto.modulo === 'string'
  );
}

/** Dias inteiros entre `em` e agora — usado só para decidir se o atalho ainda vale. */
export function diasDesde(em: string, agora: number = Date.now()): number {
  const quando = Date.parse(em);
  if (Number.isNaN(quando)) return Number.POSITIVE_INFINITY;
  return Math.floor((agora - quando) / 86_400_000);
}

/**
 * O último lugar de anotação, se ainda vale.
 *
 * Devolve `null` — e nunca lança — quando não há nada, quando o conteúdo não faz sentido
 * ou quando o `localStorage` está indisponível (aba anônima, cota estourada). Um atalho
 * que quebra a tela inicial é pior do que atalho nenhum.
 */
export function ultimaDiaria(agora: number = Date.now()): AtalhoDeDiaria | null {
  if (typeof window === 'undefined') return null;

  try {
    const bruto = window.localStorage.getItem(CHAVE);
    if (!bruto) return null;

    const valor: unknown = JSON.parse(bruto);
    if (!ehAtalho(valor)) return null;
    if (diasDesde(valor.em, agora) > ATALHO_VALIDO_POR_DIAS) return null;

    return valor;
  } catch {
    return null;
  }
}

export function lembraDiaria(atalho: Omit<AtalhoDeDiaria, 'em'>): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      CHAVE,
      JSON.stringify({ ...atalho, em: new Date().toISOString() }),
    );
  } catch {
    // Sem espaço ou sem permissão: o app continua igual, só sem atalho.
  }
}

export function esqueceDiaria(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CHAVE);
  } catch {
    // idem
  }
}

/**
 * A data de hoje **do aparelho**, como dia civil `YYYY-MM-DD`.
 *
 * A diária é dia civil e nunca é convertida para UTC (R9). Quem sabe que dia é hoje é o
 * celular na locação, não o servidor — às 21h de Brasília o servidor em UTC já virou o dia
 * seguinte, e o atalho levaria para a diária de amanhã, que ainda não aconteceu.
 */
export function hojeLocal(data: Date = new Date()): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/**
 * Quais dias desta lista devem estar no aparelho: hoje e amanhã.
 *
 * Função pura e exportada porque é a regra, não o efeito — e porque quem decide o que é
 * "hoje" é o relógio do **aparelho** (R9): a lista de dias vem do servidor com a página, e
 * a escolha acontece aqui, no fuso de quem está em locação.
 */
export function diasParaFixar(
  dias: readonly { id: string; date: string }[],
  agora: Date = new Date(),
): string[] {
  const hoje = hojeLocal(agora);
  const amanha = hojeLocal(new Date(agora.getTime() + 86_400_000));

  return dias
    .filter((dia) => dia.date === hoje || dia.date === amanha)
    .map((dia) => dia.id);
}
