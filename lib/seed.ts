import type { Boletim } from '@/types/boletim';
import { SCHEMA_VERSION } from '@/types/boletim';
import {
  createCena,
  createMembroEquipe,
  createMidiaSuporte,
  createTake,
} from '@/lib/factory';
import { loadAll, replaceAll } from '@/lib/storage';
import { todayISODate } from '@/utils/date';
import { uid } from '@/utils/id';

const SEED_FLAG = 'bdc:seeded:v1';

function take(numero: string, observacao: string, aprovado = false) {
  return { ...createTake(numero), observacao, aprovado };
}

/** Boletim demonstrativo, fiel aos dados pedidos na especificação. */
export function createDemoBoletim(): Boletim {
  const now = new Date().toISOString();

  const cena1 = createCena('1');
  cena1.optica.lentes = '40mm';
  cena1.tecnica = {
    formatoGravacao: 'R3D MQ',
    resolucao: '5K 17:9',
    frameRate: '23.98',
    iso: '640',
    obturador: '180',
    balancoBranco: '5300K',
    lutPerfil: '709',
    espacoCor: '',
    diafragma: 'T2.8',
  };
  cena1.cartaoRolo = 'A003';
  cena1.takes = [take('1', 'Master'), take('2', 'Circle take', true)];

  const cena2 = createCena('2');
  cena2.tecnica = {
    formatoGravacao: 'R3D MQ',
    resolucao: '5K 17:9',
    frameRate: '23.98',
    iso: '640',
    obturador: '180',
    balancoBranco: '5300K',
    lutPerfil: '709',
    espacoCor: '',
    diafragma: 'T2.8',
  };
  cena2.optica = {
    lentes: '25mm',
    filtros: 'ND 0.9 + ND 0.6',
    matteBox: true,
  };
  cena2.cartaoRolo = 'A004';
  cena2.observacoes = 'Cena principal do dia.';
  cena2.takes = [
    take('1', 'Boom safe'),
    take('3', 'Boom em quadro'),
    take('6', 'Foco doce', true),
  ];

  const cena16 = createCena('16');
  cena16.cartaoRolo = 'A004';
  cena16.observacoes = 'REC falso';
  cena16.optica.lentes = '32mm';
  cena16.takes = [take('1', 'REC falso — descartar')];

  const cena17 = createCena('17.1');
  cena17.cartaoRolo = 'A005';
  cena17.observacoes = 'Boom/foco';
  cena17.optica.lentes = '50mm';
  cena17.takes = [
    take('1', 'Boom em quadro'),
    take('2', 'Foco perdido'),
    take('3', 'Take bom', true),
  ];

  const midiaA004 = createMidiaSuporte();
  midiaA004.tipoMidia = 'RED MINI-MAG';
  midiaA004.numeroCartao = 'A004';
  midiaA004.quantidade = '1';
  midiaA004.responsavel = 'DIT';

  const midiaA005 = createMidiaSuporte();
  midiaA005.tipoMidia = 'RED MINI-MAG';
  midiaA005.numeroCartao = 'A005';
  midiaA005.quantidade = '1';
  midiaA005.responsavel = 'DIT';

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
    camera: {
      numeroId: 'A',
      modelo: 'RED V-Raptor',
      operador: 'Operador(a) A',
      foco: 'Assistente 1',
      claquetista: 'Assistente 2',
    },
    cenas: [cena1, cena2, cena16, cena17],
    midiaSuporte: [midiaA004, midiaA005],
    cenasDoDia: {
      cenasRealizadas: '1, 2, 16, 17.1',
      totalTakes: '9',
      tomadasAprovadas: '3',
      continuidade: 'Sem pendências',
    },
    horarios: {
      inicio: '07:00',
      fim: '18:00',
      almoco: '12:30–13:30',
      totalHoras: '11h',
      horaExtra: '—',
    },
    equipeCamera: [eqOp, eqFoco, eqClaq],
    observacoesGerais:
      'Boletim demonstrativo gerado automaticamente no primeiro acesso. ' +
      'Use como referência, edite à vontade ou exclua.',
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
