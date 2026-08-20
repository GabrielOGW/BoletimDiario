/**
 * A folha impressa do Boletim Diário de Câmera — a leitura única do dia.
 *
 * O problema que este módulo resolve: preencher no set é repetitivo por natureza
 * (todo plano herda a configuração do anterior), mas *imprimir* essa repetição
 * transforma uma diária de 21 planos em oito páginas onde a única coisa que muda
 * é a lente. Aqui a diária é lida uma vez, o que é comum vira **padrão da diária**
 * e cada plano imprime só o que **difere** desse padrão.
 *
 * Módulo puro (sem React, sem I/O) para poder ser testado direto no harness .mjs.
 */
import type { Boletim, Plano, Take } from '@/types/boletim';

/** Um campo técnico como ele aparece no papel. */
export interface CampoTecnico {
  chave: string;
  /** Valor cru, comparável entre planos ('' quando não preenchido). */
  valor: string;
  /** Como o valor é impresso ('24' → '24 fps'). */
  texto: string;
}

/** Um take na folha. */
export interface TakeFolha {
  id: string;
  numero: string;
  aprovado: boolean;
  cartao: string;
  clipSync: string;
  nota: string;
  /** Tem algo além do número e do aprovado — só estes viram linha própria. */
  temDetalhe: boolean;
}

/** Um plano na folha — a unidade que nunca quebra entre páginas. */
export interface ItemFolha {
  id: string;
  /** Identificação curta dentro da cena ('A · 3', '1.11', '#2'). */
  ident: string;
  /** Câmera — só quando a diária é multicam ou o plano foge da câmera única. */
  camera: string | null;
  /** Tipo de captação — só quando não é 'Normal'. */
  tipo: string | null;
  /** O que este plano tem de diferente do padrão da diária. */
  ajustes: string[];
  takes: TakeFolha[];
  /** Só os takes que têm cartão, clip/sync ou nota. */
  detalhes: TakeFolha[];
  observacoes: string;
}

/** Uma cena na folha. */
export interface CenaFolha {
  id: string;
  numero: string;
  /** Preenchido quando todos os blocos da cena têm a mesma letra. */
  blocoUnico: string | null;
  planos: number;
  takes: number;
  aprovados: number;
  itens: ItemFolha[];
}

export interface Folha {
  /** A configuração majoritária da diária, impressa uma única vez. */
  padrao: CampoTecnico[];
  cenas: CenaFolha[];
  /** Cartões distintos vistos nos takes e no inventário de mídia. */
  cartoes: string[];
  /** Câmera única da diária — some das linhas de take e vira cabeçalho. */
  cameraUnica: string | null;
  totalPlanos: number;
  totalTakes: number;
  totalAprovados: number;
}

type Formatador = (valor: string) => string;

/**
 * Ordem de leitura no papel: sensor → tempo → exposição → óptica → tratamento.
 * É a ordem em que um assistente confere a câmera, não a ordem do formulário.
 */
const CAMPOS: { chave: string; formata: Formatador }[] = [
  { chave: 'formatoGravacao', formata: (v) => v },
  { chave: 'resolucao', formata: (v) => v },
  { chave: 'frameRate', formata: (v) => `${v} fps` },
  { chave: 'obturador', formata: (v) => `${v}°` },
  { chave: 'iso', formata: (v) => `ISO ${v}` },
  { chave: 'diafragma', formata: (v) => v },
  { chave: 'balancoBranco', formata: (v) => v },
  { chave: 'lentes', formata: (v) => v },
  {
    chave: 'filtros',
    formata: (v) => (SEM_FILTRO.has(v.toLowerCase()) ? 'sem filtro' : v),
  },
  { chave: 'matteBox', formata: (v) => (v === 'sim' ? 'Matte Box' : 'sem Matte Box') },
  { chave: 'lutPerfil', formata: (v) => v },
  { chave: 'espacoCor', formata: (v) => v },
];

const BOOLEANOS = new Set(['matteBox']);

/** Como o set escreve "nenhum filtro" — sozinho, "sem" não diz do quê. */
const SEM_FILTRO = new Set(['sem', 'nenhum', 'nao', 'não', 'n/a', '-']);

/** Valor cru de um campo técnico do plano — '' quando não preenchido. */
export function valorDoCampo(plano: Plano, chave: string): string {
  if (chave === 'lentes') return plano.optica.lentes.trim();
  if (chave === 'filtros') return plano.optica.filtros.trim();
  if (chave === 'matteBox') return plano.optica.matteBox ? 'sim' : 'nao';
  const tecnica = plano.tecnica as unknown as Record<string, string>;
  const bruto = tecnica[chave];
  return typeof bruto === 'string' ? bruto.trim() : '';
}

function todosOsPlanos(boletim: Boletim): Plano[] {
  const planos: Plano[] = [];
  for (const cena of boletim.cenas)
    for (const bloco of cena.blocos) for (const plano of bloco.planos) planos.push(plano);
  return planos;
}

/**
 * O padrão da diária: para cada campo, o valor que a **maioria** dos planos usa.
 *
 * Maioria (e não "o mais comum") é o que garante que os ajustes por plano sejam a
 * exceção — se metade da diária roda a 24 e metade a 48, não existe padrão de fps
 * e os dois valores continuam impressos plano a plano, que é a verdade do dia.
 */
export function padraoDaDiaria(planos: Plano[]): Map<string, string> {
  const padrao = new Map<string, string>();
  if (planos.length < 2) return padrao;

  for (const campo of CAMPOS) {
    const contagem = new Map<string, number>();
    for (const plano of planos) {
      const valor = valorDoCampo(plano, campo.chave);
      if (!valor) continue;
      contagem.set(valor, (contagem.get(valor) ?? 0) + 1);
    }
    let melhorValor = '';
    let melhorQtd = 0;
    for (const [valor, qtd] of contagem) {
      if (qtd > melhorQtd) {
        melhorValor = valor;
        melhorQtd = qtd;
      }
    }
    if (melhorQtd >= 2 && melhorQtd * 2 > planos.length)
      padrao.set(campo.chave, melhorValor);
  }
  return padrao;
}

/** O padrão formatado para impressão — na ordem de conferência da câmera. */
export function padraoImpresso(padrao: Map<string, string>): CampoTecnico[] {
  const saida: CampoTecnico[] = [];
  for (const campo of CAMPOS) {
    const valor = padrao.get(campo.chave);
    if (!valor) continue;
    if (BOOLEANOS.has(campo.chave) && valor !== 'sim') continue;
    saida.push({ chave: campo.chave, valor, texto: campo.formata(valor) });
  }
  return saida;
}

/**
 * O que este plano tem de diferente do padrão.
 *
 * Campo vazio nunca vira ajuste: ausência de anotação não é uma decisão de câmera,
 * e imprimir "—" para ela foi exatamente o que encheu as oito páginas.
 */
export function ajustesDoPlano(plano: Plano, padrao: Map<string, string>): string[] {
  const ajustes: string[] = [];
  for (const campo of CAMPOS) {
    const valor = valorDoCampo(plano, campo.chave);
    if (!valor) continue;
    const referencia = padrao.get(campo.chave);
    if (referencia === valor) continue;
    // Sem padrão para comparar, um booleano só fala quando é "sim" — imprimir
    // "sem Matte Box" em toda a diária seria ruído, não informação.
    if (BOOLEANOS.has(campo.chave) && !referencia && valor !== 'sim') continue;
    ajustes.push(campo.formata(valor));
  }
  return ajustes;
}

/**
 * Identificação curta do plano dentro da cena.
 *
 * O que é igual na cena inteira já está no cabeçalho dela: repetir "Bloco A" em treze
 * planos, ou o mesmo número de plano em todos os blocos, ocupa a coluna sem separar
 * nada. Sobra o que de fato distingue um plano do vizinho — que é o que a OD escreve
 * ("1.2 - A").
 */
export function identDoPlano(
  blocoLetra: string,
  planoNumero: string,
  blocoUnico: string | null,
  planoUnico: string | null,
  posicao: number,
): string {
  const letra = blocoLetra.trim();
  const numero = planoNumero.trim();
  const partes: string[] = [];
  if (letra && letra !== blocoUnico) partes.push(letra);
  if (numero && numero !== letra && numero !== planoUnico) partes.push(numero);
  return partes.length > 0 ? partes.join(' · ') : `#${posicao}`;
}

function takeFolha(take: Take): TakeFolha {
  const cartao = take.cartao.trim();
  const clipSync = take.clipSync.trim();
  const nota = take.notaOperacional.trim();
  return {
    id: take.id,
    numero: take.numero.trim(),
    aprovado: take.aprovado,
    cartao,
    clipSync,
    nota,
    temDetalhe: Boolean(cartao || clipSync || nota),
  };
}

/** Monta a folha inteira a partir do boletim já normalizado. */
export function montaFolha(boletim: Boletim): Folha {
  const planos = todosOsPlanos(boletim);
  const padrao = padraoDaDiaria(planos);

  const cadastradas = boletim.camerasCadastradas;
  const nomeDaCamera = (plano: Plano): string =>
    cadastradas.find((cam) => cam.id === plano.cameraId)?.nomeId.trim() ||
    plano.cameraNome.trim();
  // Numa diária de câmera única, repetir o nome dela em todo plano e em toda linha
  // de take não distingue nada — a câmera fica no cabeçalho e some da tabela.
  const nomesUsados = new Set(planos.map(nomeDaCamera).filter(Boolean));
  const cameraUnica =
    cadastradas.length <= 1 && nomesUsados.size <= 1 ? ([...nomesUsados][0] ?? '') : null;

  const cartoes = new Set<string>();
  let totalTakes = 0;
  let totalAprovados = 0;

  const cenas: CenaFolha[] = boletim.cenas.map((cena) => {
    const letras = new Set(
      cena.blocos.map((bloco) => bloco.letra.trim()).filter((letra) => letra !== ''),
    );
    const temBlocoSemLetra = cena.blocos.some((bloco) => bloco.letra.trim() === '');
    const blocoUnico = letras.size === 1 && !temBlocoSemLetra ? [...letras][0] : null;

    // O número do plano só é dispensável quando a letra do bloco continua distinguindo:
    // apagar os dois deixaria os planos sem nome.
    const numeros = cena.blocos.flatMap((bloco) =>
      bloco.planos.map((plano) => plano.numero.trim()),
    );
    const planoUnico =
      blocoUnico === null &&
      numeros.length > 1 &&
      numeros.every((numero) => numero !== '' && numero === numeros[0])
        ? numeros[0]
        : null;

    const itens: ItemFolha[] = [];
    let planosDaCena = 0;
    let takesDaCena = 0;
    let aprovadosDaCena = 0;

    for (const bloco of cena.blocos) {
      for (const plano of bloco.planos) {
        planosDaCena += 1;
        const takes = plano.takes.map(takeFolha);
        for (const take of takes) {
          takesDaCena += 1;
          if (take.aprovado) aprovadosDaCena += 1;
          if (take.cartao) cartoes.add(take.cartao);
        }
        const camera = nomeDaCamera(plano);
        const tipo = plano.tipo.trim();
        itens.push({
          id: plano.id,
          ident: identDoPlano(
            bloco.letra,
            plano.numero,
            blocoUnico,
            planoUnico,
            itens.length + 1,
          ),
          camera: cameraUnica === null && camera ? camera : null,
          tipo: tipo && tipo.toLowerCase() !== 'normal' ? tipo : null,
          ajustes: ajustesDoPlano(plano, padrao),
          takes,
          detalhes: takes.filter((take) => take.temDetalhe),
          observacoes: plano.observacoes.trim(),
        });
      }
    }

    totalTakes += takesDaCena;
    totalAprovados += aprovadosDaCena;

    return {
      id: cena.id,
      numero: cena.numero.trim() || 'S/N',
      blocoUnico,
      planos: planosDaCena,
      takes: takesDaCena,
      aprovados: aprovadosDaCena,
      itens,
    };
  });

  for (const midia of boletim.midiaSuporte)
    if (midia.numeroCartao.trim()) cartoes.add(midia.numeroCartao.trim());

  return {
    padrao: padraoImpresso(padrao),
    cenas,
    cartoes: [...cartoes].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    cameraUnica: cameraUnica || null,
    totalPlanos: planos.length,
    totalTakes,
    totalAprovados,
  };
}
