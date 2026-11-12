/**
 * Boletins de demonstração de Som e Continuidade (ADR-043) — o par do demo de Câmera
 * (`lib/seed.ts`), que continua exatamente como era.
 *
 * Os três demos contam **a mesma diária**: Produtora Exemplo, Diária 04, cenas 18A e 21C.
 * Quem abre o app pela primeira vez vê como os três boletins descrevem o mesmo dia, cada
 * um pelo seu departamento.
 *
 * Semeia uma vez por aparelho, com bandeira própria (`bdc:seeded-locais:v1`), e só no store
 * que está vazio: quem já usava o app ganha os dois demos uma vez; quem apagou um demo não o
 * vê voltar.
 */

import { hojeISO, novoId } from './comum';
import {
  criaBoletimContinuidade,
  criaCenaContinuidade,
  criaNota,
  criaPlanoContinuidade,
  proximoTakeContinuidade,
  type BoletimContinuidade,
  type PlanoContinuidade,
  type TakeContinuidade,
} from './continuidade';
import {
  criaBoletimSom,
  criaCanal,
  criaCena,
  criaPlano,
  criaRolo,
  type BoletimSom,
  type CanalSom,
  type PlanoSom,
  type TakeSom,
} from './som';
import { storeContinuidade, storeSom } from './store';

const SEED_FLAG = 'bdc:seeded-locais:v1';

const PRODUCAO = {
  produtora: 'Produtora Exemplo',
  diretor: 'A. Diretor(a)',
  diaria: '04',
  locacao: 'Apartamento — Centro',
};

// ---- Som ----

function canaisDoDia(): CanalSom[] {
  return [
    { ...criaCanal(1), nome: 'Boom', microfone: 'Sennheiser MKH 416', captacao: 'Boom' },
    { ...criaCanal(2), nome: 'João', microfone: 'Sanken COS-11D', captacao: 'Lapela' },
    { ...criaCanal(3), nome: 'Maria', microfone: 'DPA 6060', captacao: 'Lapela' },
  ];
}

function takeSom(numero: string, dados: Partial<TakeSom>): TakeSom {
  return {
    id: novoId('take'),
    numero,
    julgamento: '',
    natureza: '',
    motivoNG: '',
    rolo: '004',
    arquivo: '',
    tcInicio: '',
    tcFim: '',
    duracao: '',
    canais: canaisDoDia(),
    problemas: [],
    obsProblemas: '',
    observacoes: '',
    ...dados,
  };
}

function planoSom(codigo: string, descricao: string, takes: TakeSom[]): PlanoSom {
  return { ...criaPlano(codigo), descricao, takes };
}

export function criaDemoSom(): BoletimSom {
  const boletim = criaBoletimSom();
  boletim.producao = {
    ...PRODUCAO,
    tituloProjeto: 'Projeto Demo — Boletim de Som',
    data: hojeISO(),
  };
  boletim.equipe = { mixer: 'Técnico(a) de Som', boom: 'Microfonista' };
  boletim.tecnica = {
    gravador: 'Sound Devices 833',
    sampleRate: '48 kHz',
    bitDepth: '24 bits',
    frameRate: '23.976',
    timecode: 'Jam (Tentacle)',
    formato: 'WAV poly',
  };
  boletim.rolos = [
    { ...criaRolo('004'), midia: 'SD #1 · 128 GB', equipamento: 'Sound Devices 833' },
    {
      ...criaRolo('005'),
      midia: 'SD #2 · 128 GB',
      equipamento: 'Sound Devices 833',
      observacoes: 'Cartão trocado no almoço; cópia conferida',
    },
  ];

  const cena18 = criaCena('18A');
  cena18.planos = [
    planoSom('1', 'Plano geral da sala', [
      takeSom('1', {
        julgamento: 'RECORDED',
        arquivo: '004_001',
        tcInicio: '10:12:04:10',
        tcFim: '10:13:01:02',
        duracao: '00:57',
      }),
      takeSom('2', {
        julgamento: 'NG',
        motivoNG: 'Avião',
        arquivo: '004_002',
        tcInicio: '10:15:20:00',
        tcFim: '10:16:02:14',
        duracao: '00:42',
        problemas: ['RUIDO_EXTERNO'],
        obsProblemas: 'Avião a partir dos 20 s',
      }),
      takeSom('3', {
        julgamento: 'CIRCLE',
        arquivo: '004_003',
        tcInicio: '10:18:41:05',
        tcFim: '10:19:39:20',
        duracao: '00:58',
      }),
    ]),
    planoSom('4', 'Close de João', [
      takeSom('1', {
        julgamento: 'HOLD',
        arquivo: '004_004',
        duracao: '00:31',
        problemas: ['MICROFONE'],
        obsProblemas: 'Lapela do João raspando na camisa no fim',
      }),
      takeSom('2', {
        julgamento: 'CIRCLE',
        arquivo: '004_005',
        duracao: '00:33',
        observacoes: 'Ganho do boom +3 dB',
      }),
    ]),
  ];

  const cena21 = criaCena('21C');
  cena21.planos = [
    planoSom('3', 'Maria na janela', [
      takeSom('1', {
        julgamento: 'NG',
        motivoNG: 'Fala encoberta',
        rolo: '005',
        arquivo: '005_001',
        duracao: '00:25',
        problemas: ['INAUDIVEL', 'ADR'],
        obsProblemas: 'Última fala da Maria inaudível — prever ADR',
      }),
      takeSom('2', {
        julgamento: 'CIRCLE',
        rolo: '005',
        arquivo: '005_002',
        duracao: '00:27',
      }),
    ]),
    planoSom('WILD', 'Wild / room tone', [
      takeSom('1', {
        natureza: 'ROOM_TONE',
        rolo: '005',
        arquivo: '005_003',
        duracao: '01:00',
        canais: [canaisDoDia()[0]],
        observacoes: 'Room tone da sala, 1 minuto',
      }),
    ]),
  ];

  boletim.cenas = [cena18, cena21];
  boletim.observacoesGerais =
    'Gerador ligado na rua das 14h às 15h. Room tone gravado para a sala do apartamento.';
  return boletim;
}

// ---- Continuidade ----

type DadosDoTake = Omit<Partial<TakeContinuidade>, 'acao'> & {
  acao?: Partial<TakeContinuidade['acao']>;
};

function takeCont(numero: string, dados: DadosDoTake): TakeContinuidade {
  const base = proximoTakeContinuidade({ takes: [] } as unknown as PlanoContinuidade);
  return { ...base, numero, ...dados, acao: { ...base.acao, ...(dados.acao ?? {}) } };
}

export function criaDemoContinuidade(): BoletimContinuidade {
  const boletim = criaBoletimContinuidade();
  boletim.producao = {
    ...PRODUCAO,
    tituloProjeto: 'Projeto Demo — Boletim de Continuidade',
    data: hojeISO(),
  };
  boletim.continuista = 'Continuísta Exemplo';

  const cena18 = criaCenaContinuidade('18A');
  Object.assign(cena18, {
    pagina: '1 4/8',
    diaHistoria: 'Dia 3',
    intExt: 'INT',
    diaNoite: 'DAY',
    locacao: 'Sala do apartamento',
    descricao: 'João chega em casa e encontra Maria esperando no sofá.',
    notas: [
      criaNota(
        'FIGURINO',
        'João: camisa azul, manga direita dobrada; relógio no pulso esquerdo',
      ),
      criaNota('OBJETOS', 'Copo d’água na mesa de centro, cheio até a metade'),
    ],
  });

  const plano1 = criaPlanoContinuidade('1');
  Object.assign(plano1, {
    tamanho: 'Plano geral',
    angulo: 'Altura dos olhos',
    movimento: 'Fixo',
    descricao: 'Sala inteira; porta à esquerda, sofá ao fundo',
    takes: [
      takeCont('1', {
        veredito: 'NG',
        motivoNG: 'Ator errou a marca',
        duracao: '00:57',
        observacoes: 'João entra pela porta e para antes da marca',
      }),
      takeCont('2', {
        veredito: 'HOLD',
        duracao: '00:55',
        observacoes: 'Bom, mas Maria olhou para a câmera no fim',
        problema: true,
        problemaDescricao: 'João pega o copo com a mão esquerda — no plano 4 é a direita',
        acao: { objectInteraction: 'Pega o copo com a mão esquerda' },
      }),
      takeCont('3', {
        veredito: 'CIRCLE',
        duracao: '00:58',
        observacoes: 'Take do diretor',
        acao: {
          startPosition: 'João em pé, junto à porta',
          endPosition: 'Sentado no sofá, à direita de Maria',
          objectInteraction: 'Pega o copo com a mão direita e bebe um gole',
          dialogueChanges: 'Trocou "nunca" por "jamais" na segunda fala',
        },
        notas: [criaNota('OLHAR', 'Maria olha para a janela, à esquerda do quadro')],
      }),
    ],
  });

  const plano4 = criaPlanoContinuidade('4');
  Object.assign(plano4, {
    tamanho: 'Close',
    angulo: 'Leve contra-plongée',
    movimento: 'Fixo',
    eyeline: 'João olha à esquerda da câmera',
    descricao: 'Close de João no sofá',
    takes: [
      takeCont('1', { veredito: 'HOLD', duracao: '00:31' }),
      takeCont('2', {
        veredito: 'CIRCLE',
        duracao: '00:33',
        observacoes: 'Copo na mão direita, nível de água igual ao plano 1',
      }),
    ],
  });
  cena18.planos = [plano1, plano4];

  const cena21 = criaCenaContinuidade('21C');
  Object.assign(cena21, {
    pagina: '6/8',
    diaHistoria: 'Dia 3',
    intExt: 'INT',
    diaNoite: 'DUSK',
    locacao: 'Quarto',
    descricao: 'Maria, na janela, liga para a irmã.',
    notas: [
      criaNota('CABELO_MAQUIAGEM', 'Maria: cabelo solto, sem batom'),
      criaNota(
        'MOVIMENTO_ENTRE_PLANOS',
        'Maria vira para a direita ao desligar o telefone',
      ),
    ],
  });
  const plano3 = criaPlanoContinuidade('3');
  Object.assign(plano3, {
    tamanho: 'Plano médio',
    descricao: 'Maria na janela, contraluz',
    takes: [
      takeCont('1', {
        veredito: 'NG',
        motivoNG: 'Fala encoberta',
        duracao: '00:25',
        acao: { dialogueChanges: 'Improvisou "tá me ouvindo?"' },
      }),
      takeCont('2', { veredito: 'CIRCLE', duracao: '00:27' }),
    ],
  });
  cena21.planos = [plano3];

  boletim.cenas = [cena18, cena21];
  boletim.observacoesGerais =
    'Cena 21C precisa de ADR na última fala (ver boletim de som). Figurino de João segue para a cena 22.';
  return boletim;
}

/** Semeia os dois demos uma vez por aparelho — só no store que estiver vazio. */
export function ensureSeedLocal(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem(SEED_FLAG)) return;
    window.localStorage.setItem(SEED_FLAG, 'true');
    if (storeSom.loadAll().length === 0) storeSom.upsert(criaDemoSom());
    if (storeContinuidade.loadAll().length === 0) {
      storeContinuidade.upsert(criaDemoContinuidade());
    }
  } catch {
    // Sem LocalStorage (aba anônima, cota cheia): o app abre igual, só sem os demos.
  }
}
