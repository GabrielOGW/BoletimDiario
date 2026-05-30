import type {
  Bloco,
  Boletim,
  CameraCadastrada,
  Cena,
  Plano,
  Take,
} from '@/types/boletim';
import { SCHEMA_VERSION } from '@/types/boletim';
import {
  createCameraCadastrada,
  createMembroEquipe,
  createMidiaSuporte,
  createPlano,
  createTake,
} from '@/lib/factory';
import { loadAll, replaceAll } from '@/lib/storage';
import { todayISODate } from '@/utils/date';
import { uid } from '@/utils/id';

const SEED_FLAG = 'bdc:seeded:v1';

function mkTake(
  numero: string,
  nota: string,
  opts: { cartao?: string; clip?: string; aprovado?: boolean } = {},
): Take {
  return {
    ...createTake(numero),
    notaOperacional: nota,
    cartao: opts.cartao ?? '',
    clipSync: opts.clip ?? '',
    aprovado: opts.aprovado ?? false,
  };
}

function mkPlano(
  numero: string,
  camera: CameraCadastrada,
  tipo: string,
  tecnica: Partial<Plano['tecnica']>,
  optica: Partial<Plano['optica']>,
  takes: Take[],
): Plano {
  const plano = createPlano(numero);
  plano.tipo = tipo;
  plano.cameraId = camera.id;
  plano.cameraNome = camera.nomeId;
  plano.tecnica = { ...plano.tecnica, ...tecnica };
  plano.optica = { ...plano.optica, ...optica };
  plano.takes = takes;
  return plano;
}

function mkBloco(letra: string, planos: Plano[]): Bloco {
  return { id: uid('bloco'), letra, planos };
}

function mkCena(numero: string, blocos: Bloco[]): Cena {
  return { id: uid('cena'), numero, blocos };
}

/** Boletim demonstrativo no novo workflow (multicam · cena/bloco/plano/take). */
export function createDemoBoletim(): Boletim {
  const now = new Date().toISOString();

  const camA = createCameraCadastrada();
  camA.nomeId = 'A CAM';
  camA.modelo = 'Komodo RED';
  camA.operador = 'Operador(a) A';
  camA.foco = 'Assistente 1';
  camA.claquetista = 'Assistente 2';

  const camB = createCameraCadastrada();
  camB.nomeId = 'B CAM';
  camB.modelo = 'Nikon ZR';
  camB.operador = 'Operador(a) B';
  camB.foco = 'Assistente 3';
  camB.claquetista = 'Assistente 2';

  const red = {
    formatoGravacao: 'R3D MQ',
    resolucao: '5K 17:9',
    frameRate: '23.98',
    iso: '640',
    obturador: '180',
    balancoBranco: '5300K',
    lutPerfil: '709',
    diafragma: 'T2.8',
  };
  const nikon = {
    formatoGravacao: 'ProRes 422 HQ',
    resolucao: '4K UHD (3840x2160)',
    frameRate: '24',
    iso: '800',
    obturador: '180',
    balancoBranco: '5600K',
    lutPerfil: 'Rec.709',
    diafragma: 'T2.8',
  };

  // Cena 18 · Bloco A (Plano 1, Plano 4) · Bloco B (Plano Série)
  const cena18 = mkCena('18', [
    mkBloco('A', [
      mkPlano(
        '1',
        camA,
        'Normal',
        red,
        { lentes: '25mm', filtros: 'ND 0.9 + ND 0.6', matteBox: true },
        [
          mkTake('1', 'Boom safe', { cartao: 'A004', clip: 'A002' }),
          mkTake('3', 'Boom em quadro', { cartao: 'A004', clip: 'A004' }),
          mkTake('6', 'Foco doce', { cartao: 'A004', clip: 'A006', aprovado: true }),
        ],
      ),
      mkPlano('4', camA, 'Normal', red, { lentes: '40mm', matteBox: true }, [
        mkTake('1', 'Master'),
        mkTake('2', 'Circle take', { cartao: 'A004', clip: 'A009', aprovado: true }),
      ]),
    ]),
    mkBloco('B', [
      mkPlano('2', camA, 'Série', red, { lentes: '50mm' }, [
        mkTake('1', 'Série — passagem 1'),
        mkTake('2', 'Série — passagem 2', { aprovado: true }),
      ]),
    ]),
  ]);

  // Cena 21 · Bloco C · Plano 3 (B CAM)
  const cena21 = mkCena('21', [
    mkBloco('C', [
      mkPlano('3', camB, 'Normal', nikon, { lentes: '35mm' }, [
        mkTake('1', 'NG som'),
        mkTake('2', 'boom reflexo', { cartao: 'A010', clip: 'A002', aprovado: true }),
      ]),
    ]),
  ]);

  // Cena 16 · REC falso
  const cena16 = mkCena('16', [
    mkBloco('A', [
      mkPlano('1', camA, 'Normal', red, { lentes: '32mm' }, [
        mkTake('1', 'REC falso — descartar', { cartao: 'A004' }),
      ]),
    ]),
  ]);

  // Cena 17.1 · Boom/foco
  const cena171 = mkCena('17.1', [
    mkBloco('A', [
      mkPlano('1', camA, 'Insert', red, { lentes: '50mm' }, [
        mkTake('1', 'Boom em quadro'),
        mkTake('2', 'Foco perdido'),
        mkTake('3', 'Take bom', { cartao: 'A005', clip: 'A012', aprovado: true }),
      ]),
    ]),
  ]);

  const midiaA004 = createMidiaSuporte();
  midiaA004.tipoMidia = 'RED MINI-MAG';
  midiaA004.numeroCartao = 'A004';
  midiaA004.quantidade = '1';
  midiaA004.responsavel = 'DIT';

  const midiaA010 = createMidiaSuporte();
  midiaA010.tipoMidia = 'CFexpress';
  midiaA010.numeroCartao = 'A010';
  midiaA010.quantidade = '1';
  midiaA010.responsavel = 'DIT';

  const eqOp = createMembroEquipe();
  eqOp.nome = 'Operador(a) A';
  eqOp.funcao = 'Operador(a)';
  const eqFoco = createMembroEquipe();
  eqFoco.nome = 'Assistente 1';
  eqFoco.funcao = '1º AC / Foco';
  const eqClaq = createMembroEquipe();
  eqClaq.nome = 'Assistente 2';
  eqClaq.funcao = 'Claquetista';

  return {
    id: uid('bol'),
    schemaVersion: SCHEMA_VERSION,
    producao: {
      produtora: 'Produtora Exemplo',
      tituloProjeto: 'Projeto Demo — Boletim de Câmera',
      diretor: 'A. Diretor(a)',
      diretorFotografia: 'B. Fotografia (DoP)',
      data: todayISODate(),
      diaDiaria: '04',
    },
    camerasCadastradas: [camA, camB],
    cenas: [cena18, cena21, cena16, cena171],
    midiaSuporte: [midiaA004, midiaA010],
    cenasDoDia: {
      cenasRealizadas: '18, 21, 16, 17.1',
      totalTakes: '11',
      tomadasAprovadas: '4',
      continuidade: 'Sem pendências',
    },
    horarios: {
      inicio: '07:00',
      fim: '18:00',
      almocoInicio: '12:30',
      almocoFim: '13:30',
      almoco: '',
      totalHoras: '11h',
      horaExtra: '—',
    },
    equipeCamera: [eqOp, eqFoco, eqClaq],
    observacoesGerais:
      'Boletim demonstrativo gerado automaticamente no primeiro acesso. ' +
      'Multicam (A/B CAM), cenas com blocos, planos e takes. Edite ou exclua à vontade.',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Semeia o boletim demo apenas uma vez (na primeira vez que o app abre).
 * Se o usuário excluir o demo depois, ele não volta — o flag controla isso.
 */
export function ensureSeed(): void {
  if (typeof window === 'undefined') return;
  if (window.localStorage.getItem(SEED_FLAG)) return;
  window.localStorage.setItem(SEED_FLAG, 'true');
  if (loadAll().length === 0) {
    replaceAll([createDemoBoletim()]);
  }
}
