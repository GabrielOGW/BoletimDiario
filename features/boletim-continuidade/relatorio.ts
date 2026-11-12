/**
 * O Boletim de Continuidade local lido pela **mesma** estrutura da plataforma
 * (`features/continuity/estrutura.ts`): linhas, raccord, pendências, alterações de diálogo
 * e a folha `FolhaContinuidade` saem do código já testado. Puro e testável.
 */

import type {
  LocalContinuityNote,
  LocalContinuityPhoto,
  LocalContinuityTakeData,
  LocalScene,
  LocalSetup,
  LocalTake,
} from '@/lib/offline/db';
import type { FotoLocal, NotaLocal } from '@/lib/local/comum';
import { CAMPOS_ACAO_LOCAL, type BoletimContinuidade } from '@/lib/local/continuidade';
import type { CabecalhoImpressao } from '@/features/camera/FolhaCamera';

import {
  contagensDoDia,
  duracaoEmSegundos,
  linhasDaContinuidade,
  raccordDoDia,
  type ContagensDoDia,
  type LinhaContinuidade,
  type RaccordDaCena,
} from '@/features/continuity/estrutura';

const base = { productionId: 'local', version: 0, _dirty: 0 as const };

export interface LeituraLocalContinuidade {
  linhas: LinhaContinuidade[];
  raccord: RaccordDaCena[];
  contagens: ContagensDoDia;
  cabecalho: CabecalhoImpressao;
}

export function leituraDoBoletimContinuidade(
  boletim: BoletimContinuidade,
): LeituraLocalContinuidade {
  const cenas: LocalScene[] = [];
  const setups: LocalSetup[] = [];
  const takes: LocalTake[] = [];
  const dados: LocalContinuityTakeData[] = [];
  const notas: LocalContinuityNote[] = [];
  const fotos: LocalContinuityPhoto[] = [];

  const escopo = (
    nivel: { sceneId?: string; setupId?: string; takeId?: string },
    lista: { notas: NotaLocal[]; fotos: FotoLocal[] },
  ) => {
    for (const nota of lista.notas) {
      notas.push({
        ...base,
        ...nivel,
        id: nota.id,
        category: nota.categoria,
        note: nota.texto,
      });
    }
    for (const foto of lista.fotos) {
      fotos.push({
        ...base,
        ...nivel,
        id: foto.id,
        category: foto.categoria,
        caption: foto.legenda || null,
      });
    }
  };

  boletim.cenas.forEach((cena) => {
    cenas.push({
      ...base,
      id: cena.id,
      number: cena.numero.trim() || '—',
      block: '',
      page: cena.pagina || null,
      storyDay: cena.diaHistoria || null,
      intExt: cena.intExt || null,
      dayNight: cena.diaNoite || null,
      location: cena.locacao || null,
      description: cena.descricao || null,
    });
    escopo({ sceneId: cena.id }, cena);

    cena.planos.forEach((plano, ordem) => {
      setups.push({
        ...base,
        id: plano.id,
        sceneId: cena.id,
        shootingDayId: boletim.id,
        code: plano.codigo,
        shotSize: plano.tamanho || null,
        angle: plano.angulo || null,
        movement: plano.movimento || null,
        eyeline: plano.eyeline || null,
        description: plano.descricao || null,
        sortOrder: ordem,
      });
      escopo({ setupId: plano.id }, plano);

      plano.takes.forEach((take) => {
        const numero = Number(take.numero);
        takes.push({
          ...base,
          id: take.id,
          setupId: plano.id,
          number: Number.isFinite(numero) ? numero : 0,
          status: 'RECORDED',
          kind: 'SYNC',
        });
        const acao = Object.fromEntries(
          CAMPOS_ACAO_LOCAL.map((campo) => [campo, take.acao[campo] || null]),
        );
        dados.push({
          ...base,
          ...acao,
          id: `cont-${take.id}`,
          takeId: take.id,
          status: take.veredito || null,
          selected: take.veredito === 'CIRCLE',
          ngReason: take.motivoNG || null,
          durationSec: duracaoEmSegundos(take.duracao),
          hasIssue: take.problema,
          issue: take.problemaDescricao || null,
          notes: take.observacoes || null,
        });
        escopo({ takeId: take.id }, take);
      });
    });
  });

  const fonte = { cenas, setups, takes, dados, camera: [], som: [] };

  return {
    linhas: linhasDaContinuidade(fonte),
    raccord: raccordDoDia({ cenas, setups, takes, notas, fotos }),
    contagens: contagensDoDia(fonte),
    cabecalho: {
      producao: {
        name: boletim.producao.tituloProjeto,
        company: boletim.producao.produtora || null,
        director: boletim.producao.diretor || null,
        dop: null,
      },
      diaria: {
        date: boletim.producao.data,
        dayNumber: boletim.producao.diaria || null,
        callTime: null,
        wrapTime: null,
        lunchStart: null,
        lunchEnd: null,
        location: boletim.producao.locacao || null,
        unit: null,
        notes: boletim.observacoesGerais || null,
      },
      equipe: boletim.continuista
        ? [{ id: 'continuista', nome: boletim.continuista, funcao: 'Continuidade' }]
        : [],
    },
  };
}
