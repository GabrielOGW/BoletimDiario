/**
 * A estrutura do Boletim de Continuidade, sem React.
 *
 * Mesmo papel de `features/{camera,sound}/estrutura.ts`: a tela, a folha impressa e o
 * **Relatório de Progresso** leem os mesmos dados do mesmo jeito. Aqui isso vale dobrado,
 * porque o relatório é um documento derivado — se ele contar de um jeito e a tela mostrar
 * de outro, quem estiver certo perde a discussão no fim do dia.
 *
 * Sem React e sem Dexie (só `import type`): testável com type-stripping do Node.
 */

import { somaPaginas, type SomaDePaginas } from '@/domain/platform/paginas';
import type {
  LocalCameraTakeData,
  LocalContinuityNote,
  LocalContinuityPhoto,
  LocalContinuityTakeData,
  LocalScene,
  LocalSetup,
  LocalSoundTakeData,
  LocalTake,
} from '@/lib/offline/db';

import { agrupaCenas } from '@/features/diaria/cenas';

import {
  nivelDoEscopo,
  rotuloDaCategoriaDeFoto,
  rotuloDaCategoriaDeNota,
} from './raccord';

const texto = (valor: unknown): string => String(valor ?? '').trim();

// ---- Os três vereditos (continuity.md §7) ----

/**
 * A prática usa **print · hold · NG**, e o NG vem sempre com motivo.
 *
 * São três valores de `TakeStatus`, não um eixo novo: `CIRCLE` é o print (o mesmo que a
 * câmera chama de aprovado e o som de circled), `HOLD` é o "bom, mas não perfeito" que o
 * modelo não tinha antes de ADR-029, e `NG` carrega `ngReason`.
 */
export const VEREDITOS = [
  { valor: 'CIRCLE', rotulo: 'Print' },
  { valor: 'HOLD', rotulo: 'Hold' },
  { valor: 'NG', rotulo: 'NG' },
] as const;

export function rotuloDoVeredito(status: string | null | undefined): string | null {
  const valor = texto(status);
  return VEREDITOS.find((veredito) => veredito.valor === valor)?.rotulo ?? null;
}

// ---- Duração cronometrada ----

/**
 * `"00:42"` → `42`. `"1:05:03"` → `3903`. `"42"` → `42`.
 *
 * Cronômetro continua sendo o dedo da continuísta (§7): o que existe aqui é aceitar o que
 * ela leu no relógio, no formato em que se lê. Devolve `null` para o que não é duração —
 * zero seria "take de duração zero", que é uma afirmação, não uma ausência.
 */
export function duracaoEmSegundos(valor: string | null | undefined): number | null {
  const bruto = texto(valor);
  if (!bruto) return null;
  if (!/^\d{1,2}(:\d{1,2}){0,2}$/.test(bruto)) return null;

  const partes = bruto.split(':').map(Number);
  if (partes.some((parte) => Number.isNaN(parte))) return null;

  return partes.reduce((total, parte) => total * 60 + parte, 0);
}

/** `3903` → `"1:05:03"`. `42` → `"00:42"`. */
export function segundosEmDuracao(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined || segundos < 0) return '';

  const horas = Math.floor(segundos / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  const restantes = segundos % 60;
  const dois = (valor: number) => String(valor).padStart(2, '0');

  return horas > 0
    ? `${horas}:${dois(minutos)}:${dois(restantes)}`
    : `${dois(minutos)}:${dois(restantes)}`;
}

// ---- Os campos de continuidade de ação ----

export interface CampoDeAcao {
  campo: keyof LocalContinuityTakeData;
  rotulo: string;
  exemplo: string;
}

/**
 * Os catorze campos de ação, agrupados como o caderno os agrupa (§3).
 *
 * Todos texto livre: tentar estruturar "João entra pela esquerda" em enums seria mais lento
 * que escrever, e é assim que a ferramenta é abandonada. O que a estrutura entrega é busca
 * e relação com o take, não taxonomia.
 */
export const CAMPOS_DE_ACAO: { grupo: string; campos: CampoDeAcao[] }[] = [
  {
    grupo: 'Posição',
    campos: [
      {
        campo: 'startPosition',
        rotulo: 'Posição inicial',
        exemplo: 'Em pé, junto à porta',
      },
      { campo: 'endPosition', rotulo: 'Posição final', exemplo: 'Sentado no sofá' },
    ],
  },
  {
    grupo: 'Ação',
    campos: [
      { campo: 'action', rotulo: 'Ação', exemplo: 'João pega o copo com a mão direita' },
      { campo: 'movement', rotulo: 'Movimento', exemplo: 'Atravessa a sala' },
      { campo: 'direction', rotulo: 'Direção', exemplo: 'Esquerda para direita' },
      {
        campo: 'entrancesExits',
        rotulo: 'Entradas e saídas',
        exemplo: 'Sai pela porta ao fundo',
      },
    ],
  },
  {
    grupo: 'Olhar e interação',
    campos: [
      {
        campo: 'eyeline',
        rotulo: 'Eyeline',
        exemplo: 'Olha para fora do quadro, à direita',
      },
      {
        campo: 'objectInteraction',
        rotulo: 'Com objetos',
        exemplo: 'Larga o copo na mesa',
      },
      {
        campo: 'characterInteraction',
        rotulo: 'Com personagens',
        exemplo: 'Encara Maria',
      },
    ],
  },
  {
    grupo: 'Roteiro',
    campos: [
      {
        campo: 'dialogueChanges',
        rotulo: 'Alterações de diálogo',
        exemplo: 'Cortou a última fala',
      },
      { campo: 'improvisation', rotulo: 'Improviso', exemplo: 'Acrescentou "não sei"' },
      {
        campo: 'scriptDeviation',
        rotulo: 'Desvio de roteiro',
        exemplo: 'Não usou o telefone',
      },
    ],
  },
];

const TODOS_OS_CAMPOS = CAMPOS_DE_ACAO.flatMap((grupo) => grupo.campos);

/**
 * Os campos **já preenchidos** de um take.
 *
 * §3 manda mostrar status, notas e o que já tem valor; o resto fica atrás de "mais campos".
 * A regra é essa função: sem ela, cada tela decidiria por conta própria o que é "já
 * preenchido" e a folha impressa acabaria mostrando um conjunto diferente da tela.
 */
export function camposPreenchidos(
  dados: LocalContinuityTakeData | undefined,
): { rotulo: string; valor: string }[] {
  if (!dados) return [];

  return TODOS_OS_CAMPOS.flatMap((campo) => {
    const valor = texto(dados[campo.campo]);
    return valor ? [{ rotulo: campo.rotulo, valor }] : [];
  });
}

// ---- A leitura da diária ----

export interface LinhaContinuidade {
  takeId: string;
  cena: string;
  bloco: string;
  plano: string;
  take: number;
  veredito: string | null;
  print: boolean;
  motivoNG: string;
  duracao: string;
  duracaoSeg: number | null;
  nota: string;
  acao: { rotulo: string; valor: string }[];
  /** Lente e T-stop lidos de Câmera — nunca redigitados aqui (§2). */
  tecnica: string;
  /** Roll e arquivo lidos de Som. */
  som: string;
  /** Enquadramento do plano — tamanho, ângulo, movimento e descrição (setup). */
  enquadramento: string;
  /** Problema de continuidade marcado neste take (ADR-042). */
  problema: boolean;
  problemaDescricao: string;
  semDados: boolean;
}

export interface FonteDaContinuidade {
  cenas: LocalScene[];
  setups: LocalSetup[];
  takes: LocalTake[];
  dados: LocalContinuityTakeData[];
  camera: LocalCameraTakeData[];
  som: LocalSoundTakeData[];
}

/**
 * A diária inteira, na ordem em que ela é lida: cena, bloco, plano, take.
 *
 * Traz junto a técnica da Câmera e o roll do Som **do mesmo take**, porque os três apontam
 * para o mesmo `take_id`. É o §34 funcionando, e é o ganho mais concreto da plataforma
 * sobre três cadernos separados: a continuísta não redigita lente nem roll, e não pode
 * errar ao copiar.
 */
export function linhasDaContinuidade({
  cenas,
  setups,
  takes,
  dados,
  camera,
  som,
}: FonteDaContinuidade): LinhaContinuidade[] {
  const porTake = new Map(dados.map((linha) => [linha.takeId, linha]));

  const cameraPorTake = new Map<string, LocalCameraTakeData>();
  for (const linha of camera) {
    if (!cameraPorTake.has(linha.takeId)) cameraPorTake.set(linha.takeId, linha);
  }

  const somPorTake = new Map(som.map((linha) => [linha.takeId, linha]));

  const linhas: LinhaContinuidade[] = [];

  for (const cena of agrupaCenas(cenas)) {
    for (const bloco of cena.blocos) {
      const planos = setups
        .filter((setup) => setup.sceneId === bloco.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));

      for (const plano of planos) {
        for (const take of takes
          .filter((item) => item.setupId === plano.id)
          .sort((a, b) => a.number - b.number)) {
          const linha = porTake.get(take.id);
          const dadosCamera = cameraPorTake.get(take.id);
          const dadosSom = somPorTake.get(take.id);

          linhas.push({
            takeId: take.id,
            cena: cena.numero,
            bloco: texto(bloco.block),
            plano: texto(plano.code),
            take: take.number,
            veredito: rotuloDoVeredito(linha?.status),
            print: linha?.selected ?? false,
            motivoNG: texto(linha?.ngReason),
            duracao: segundosEmDuracao(linha?.durationSec),
            duracaoSeg: linha?.durationSec ?? null,
            nota: texto(linha?.notes),
            acao: camposPreenchidos(linha),
            tecnica: [texto(dadosCamera?.lens), texto(dadosCamera?.tStop)]
              .filter(Boolean)
              .join(' '),
            som: [texto(dadosSom?.soundRoll), texto(dadosSom?.fileName)]
              .filter(Boolean)
              .join(' · '),
            enquadramento: enquadramentoDoPlano(plano),
            // A marca é a verdade: desmarcar o problema o tira do relatório, mesmo que o
            // texto continue guardado (volta inteiro se a marca voltar).
            problema: Boolean(linha?.hasIssue),
            problemaDescricao: texto(linha?.issue),
            semDados: !linha,
          });
        }
      }
    }
  }

  return linhas;
}

/** "Close · contra-plongée · travelling — João no sofá". O plano lido como se descreve. */
export function enquadramentoDoPlano(plano: LocalSetup): string {
  const tecnico = [plano.shotSize, plano.angle, plano.movement]
    .map(texto)
    .filter(Boolean)
    .join(' · ');
  const descricao = texto(plano.description);
  return [tecnico, descricao].filter(Boolean).join(' — ');
}

// ---- Raccord: notas, fotos e estado do set, por cena (ADR-042) ----

export interface ItemDeRaccord {
  id: string;
  /** Onde está preso: "Cena 24", "Plano 24A/2", "Take 24A/2/3". */
  onde: string;
  /** Ordena dentro da cena: o da cena primeiro, depois plano e take na ordem do dia. */
  ordem: number;
  categoria: string;
  texto: string;
}

export interface FotoDeRaccord {
  id: string;
  onde: string;
  ordem: number;
  categoria: string;
  legenda: string;
}

export interface RaccordDaCena {
  cena: string;
  notas: ItemDeRaccord[];
  fotos: FotoDeRaccord[];
  /** As quatro coleções de estado, já em texto — "Figurino · João: camisa azul". */
  estado: ItemDeRaccord[];
}

/** Uma coleção de estado, do jeito que a folha precisa: título e as linhas em texto. */
export interface ColecaoImpressa {
  titulo: string;
  /** O campo-chave — `name`, `character`, `element`. */
  chave: string;
  /** Os campos secundários, na ordem do caderno. */
  campos: string[];
  itens: (Record<string, unknown> & {
    id: string;
    sceneId?: string | null;
    setupId?: string | null;
    takeId?: string | null;
  })[];
}

export interface FonteDoRaccord {
  cenas: LocalScene[];
  setups: LocalSetup[];
  takes: LocalTake[];
  notas: LocalContinuityNote[];
  fotos: LocalContinuityPhoto[];
  estado?: ColecaoImpressa[];
}

/**
 * Tudo o que a continuidade anotou **em volta** dos takes, agrupado por cena.
 *
 * Uma nota pode estar presa à cena, ao plano ou ao take; a montagem lê por cena. Esta
 * função resolve o "onde" de cada uma e põe tudo debaixo da cena certa — inclusive o que
 * foi anotado em outra diária, quando a cena é a mesma (o valor da continuidade é
 * atravessar dias). Só entram cenas **desta** diária: as que têm plano hoje.
 */
export function raccordDoDia({
  cenas,
  setups,
  takes,
  notas,
  fotos,
  estado = [],
}: FonteDoRaccord): RaccordDaCena[] {
  const cenaPorId = new Map(cenas.map((cena) => [cena.id, cena]));
  const setupPorId = new Map(setups.map((setup) => [setup.id, setup]));
  const takePorId = new Map(takes.map((take) => [take.id, take]));
  const ordemDoSetup = new Map(
    [...setups]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
      .map((setup, indice) => [setup.id, indice]),
  );

  const numeroDaCena = (sceneId: string | null | undefined) =>
    texto(cenaPorId.get(sceneId ?? '')?.number);

  /** Resolve cena, rótulo e ordem de um item preso a cena, plano ou take. */
  function localiza(item: {
    sceneId?: string | null;
    setupId?: string | null;
    takeId?: string | null;
  }): { cena: string; onde: string; ordem: number } | null {
    const nivel = nivelDoEscopo(item);

    if (nivel === 'TAKE') {
      const take = takePorId.get(item.takeId ?? '');
      const setup = take ? setupPorId.get(take.setupId) : undefined;
      const cena = setup ? cenaPorId.get(setup.sceneId) : undefined;
      if (!take || !setup || !cena) return null;
      return {
        cena: texto(cena.number),
        onde: `Take ${texto(cena.number)}${texto(cena.block)}/${texto(setup.code)}/${take.number}`,
        ordem: 1000 + (ordemDoSetup.get(setup.id) ?? 0) * 1000 + take.number,
      };
    }

    if (nivel === 'PLANO') {
      const setup = setupPorId.get(item.setupId ?? '');
      const cena = setup ? cenaPorId.get(setup.sceneId) : undefined;
      if (!setup || !cena) return null;
      return {
        cena: texto(cena.number),
        onde: `Plano ${texto(cena.number)}${texto(cena.block)}/${texto(setup.code)}`,
        ordem: 1000 + (ordemDoSetup.get(setup.id) ?? 0) * 1000,
      };
    }

    const numero = numeroDaCena(item.sceneId);
    if (!numero) return null;
    return { cena: numero, onde: `Cena ${numero}`, ordem: 0 };
  }

  const cenasDoDia = new Set(
    setups.map((setup) => numeroDaCena(setup.sceneId)).filter(Boolean),
  );
  const porCena = new Map<string, RaccordDaCena>();
  const daCena = (numero: string) => {
    const atual = porCena.get(numero) ?? {
      cena: numero,
      notas: [],
      fotos: [],
      estado: [],
    };
    porCena.set(numero, atual);
    return atual;
  };

  for (const nota of notas) {
    if (nota.deletedAt || !texto(nota.note)) continue;
    const local = localiza(nota);
    if (!local || !cenasDoDia.has(local.cena)) continue;
    daCena(local.cena).notas.push({
      id: nota.id,
      onde: local.onde,
      ordem: local.ordem,
      categoria: rotuloDaCategoriaDeNota(nota.category),
      texto: texto(nota.note),
    });
  }

  for (const foto of fotos) {
    if (foto.deletedAt) continue;
    const local = localiza(foto);
    if (!local || !cenasDoDia.has(local.cena)) continue;
    daCena(local.cena).fotos.push({
      id: foto.id,
      onde: local.onde,
      ordem: local.ordem,
      categoria: rotuloDaCategoriaDeFoto(foto.category),
      legenda: texto(foto.caption),
    });
  }

  for (const colecao of estado) {
    for (const item of colecao.itens) {
      if (item.deletedAt) continue;
      const local = localiza(item);
      if (!local || !cenasDoDia.has(local.cena)) continue;
      const chave = texto(item[colecao.chave]);
      const detalhes = [...colecao.campos, 'notes']
        .map((campo) => texto(item[campo]))
        .filter(Boolean)
        .join(' · ');
      daCena(local.cena).estado.push({
        id: item.id,
        onde: local.onde,
        ordem: local.ordem,
        categoria: colecao.titulo,
        texto: [chave, detalhes].filter(Boolean).join(': '),
      });
    }
  }

  const ordena = <T extends { ordem: number; categoria: string }>(lista: T[]) =>
    lista.sort((a, b) => a.ordem - b.ordem || a.categoria.localeCompare(b.categoria));

  return [...porCena.values()]
    .map((cena) => ({
      ...cena,
      notas: ordena(cena.notas),
      fotos: ordena(cena.fotos),
      estado: ordena(cena.estado),
    }))
    .sort((a, b) => a.cena.localeCompare(b.cena, 'pt-BR', { numeric: true }));
}

// ---- Pendências e alterações de diálogo (ADR-042) ----

export interface Pendencia {
  onde: string;
  texto: string;
}

/**
 * O que a montagem precisa saber **antes** de cortar: takes com problema de continuidade.
 *
 * Um take com problema e sem descrição ainda entra — "tem problema, não sei qual" é
 * melhor que nada no relatório. A descrição vazia vira um aviso explícito.
 */
export function pendenciasDoDia(linhas: LinhaContinuidade[]): Pendencia[] {
  return linhas
    .filter((linha) => linha.problema)
    .map((linha) => ({
      onde: `Cena ${linha.cena}${linha.bloco} · Plano ${linha.plano} · Take ${linha.take}`,
      texto: linha.problemaDescricao || 'Problema de continuidade sem descrição',
    }));
}

/**
 * As alterações de diálogo do dia, juntas — a seção que a montagem e a dublagem leem
 * primeiro. Vêm dos dois lugares onde podem estar: o campo do take e as notas de
 * categoria "diálogo".
 */
export function alteracoesDeDialogo(
  linhas: LinhaContinuidade[],
  raccord: RaccordDaCena[],
): Pendencia[] {
  const dosTakes = linhas.flatMap((linha) =>
    linha.acao
      .filter((campo) =>
        ['Alterações de diálogo', 'Improviso', 'Desvio de roteiro'].includes(
          campo.rotulo,
        ),
      )
      .map((campo) => ({
        onde: `Cena ${linha.cena}${linha.bloco} · Plano ${linha.plano} · Take ${linha.take}`,
        texto: `${campo.rotulo}: ${campo.valor}`,
      })),
  );

  const dasNotas = raccord.flatMap((cena) =>
    cena.notas
      .filter((nota) => nota.categoria === rotuloDaCategoriaDeNota('DIALOGO'))
      .map((nota) => ({ onde: nota.onde, texto: nota.texto })),
  );

  return [...dosTakes, ...dasNotas];
}

// ---- O Relatório de Progresso da Diária (§7) ----

export interface ContagensDoDia {
  cenas: number;
  planos: number;
  takes: number;
  prints: number;
  /** Duração somada dos takes cronometrados, formatada. */
  duracao: string;
  /** Páginas das cenas rodadas hoje, somadas em oitavos. */
  paginas: SomaDePaginas;
  cartoes: string[];
  rolls: string[];
  /** Os números das cenas rodadas — sugestão para o campo de cobertura. */
  cenasRodadas: string[];
  /** Takes marcados com problema de continuidade (ADR-042). */
  comProblema: number;
}

/**
 * Tudo que o relatório sabe **sem perguntar**.
 *
 * É o argumento mais forte a favor da plataforma que apareceu no levantamento: hoje esse
 * relatório é montado à mão, no fim do dia, somando números de três cadernos. Aqui ele é
 * uma leitura — e por isso nada disto tem coluna no banco (ADR-034).
 */
export function contagensDoDia(fonte: FonteDaContinuidade): ContagensDoDia {
  const linhas = linhasDaContinuidade(fonte);

  const cenasRodadas = [
    ...new Set(
      linhas.map((linha) => `${linha.cena}${linha.bloco}`.trim()).filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));

  const numerosRodados = new Set(linhas.map((linha) => linha.cena));

  const distintos = (valores: (string | null | undefined)[]) =>
    [...new Set(valores.map((valor) => texto(valor)).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { numeric: true }),
    );

  const takesDaDiaria = new Set(linhas.map((linha) => linha.takeId));

  const segundos = linhas.reduce((total, linha) => total + (linha.duracaoSeg ?? 0), 0);

  return {
    cenas: numerosRodados.size,
    planos: new Set(fonte.takes.map((take) => take.setupId)).size,
    takes: linhas.length,
    prints: linhas.filter((linha) => linha.print).length,
    duracao: segundosEmDuracao(segundos),
    // Só as cenas efetivamente rodadas: somar o roteiro inteiro diria quanto o filme tem,
    // e a pergunta do relatório é quanto o **dia** cobriu.
    //
    // E **uma página por número de cena**: "24A" e "24B" são duas `Scene` no modelo
    // (ADR-002) com a mesma página de roteiro. Somar as duas contaria a mesma página duas
    // vezes e o dia apareceria com o dobro da cobertura — justo no número que a produção
    // usa para saber se está atrasada.
    paginas: somaPaginas(paginaPorNumero(fonte.cenas, numerosRodados)),
    cartoes: distintos(
      fonte.camera.filter((linha) => takesDaDiaria.has(linha.takeId)).map((l) => l.card),
    ),
    rolls: distintos(
      fonte.som
        .filter((linha) => takesDaDiaria.has(linha.takeId))
        .map((l) => l.soundRoll),
    ),
    cenasRodadas,
    comProblema: linhas.filter((linha) => linha.problema).length,
  };
}

/**
 * Uma página por **número** de cena, entre as rodadas.
 *
 * O primeiro bloco que tiver página preenchida responde pelo número: os blocos de uma cena
 * são divisões da mesma página de roteiro, e na prática só um deles costuma estar
 * preenchido.
 */
function paginaPorNumero(cenas: LocalScene[], numeros: Set<string>): string[] {
  const porNumero = new Map<string, string>();

  for (const cena of cenas) {
    if (!numeros.has(cena.number)) continue;
    if (porNumero.get(cena.number)) continue;
    porNumero.set(cena.number, texto(cena.page));
  }

  return [...porNumero.values()];
}
