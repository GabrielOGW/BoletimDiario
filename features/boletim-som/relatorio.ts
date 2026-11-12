/**
 * O Boletim de Som local lido pela **mesma** estrutura do sound report da plataforma.
 *
 * Em vez de uma segunda folha e um segundo CSV, o boletim local é traduzido para as formas
 * que `features/sound/estrutura.ts` já lê — e a folha (`FolhaSom`), o CSV, os rolos, a
 * distribuição de canais e os problemas saem pelo código já testado. Duas leituras do mesmo
 * tipo de boletim seriam duas verdades sobre o mesmo relatório.
 *
 * Puro (só `import type` do Dexie): testável pelas suítes `.mjs`.
 */

import type {
  LocalScene,
  LocalSetup,
  LocalSoundDayConfig,
  LocalSoundRoll,
  LocalSoundTakeData,
  LocalSoundTakeTrack,
  LocalTake,
} from '@/lib/offline/db';
import type { BoletimSom } from '@/lib/local/som';
import type { CabecalhoImpressao } from '@/features/camera/FolhaCamera';

import { duracaoEmSegundos } from '@/features/continuity/estrutura';
import { escreveProblemas } from '@/features/sound/problemas';
import type { FonteDoRelatorio } from '@/features/sound/estrutura';

const base = { productionId: 'local', version: 0, _dirty: 0 as const };

export interface FonteLocalSom {
  fonte: FonteDoRelatorio;
  rolls: LocalSoundRoll[];
  config: LocalSoundDayConfig;
  cabecalho: CabecalhoImpressao;
}

export function fonteDoBoletimSom(boletim: BoletimSom): FonteLocalSom {
  const cenas: LocalScene[] = [];
  const setups: LocalSetup[] = [];
  const takes: LocalTake[] = [];
  const dados: LocalSoundTakeData[] = [];
  const tracks: LocalSoundTakeTrack[] = [];

  boletim.cenas.forEach((cena) => {
    // A cena local é "24A" num campo só; o bloco já vem no número.
    cenas.push({ ...base, id: cena.id, number: cena.numero.trim() || '—', block: '' });

    cena.planos.forEach((plano, ordem) => {
      setups.push({
        ...base,
        id: plano.id,
        sceneId: cena.id,
        shootingDayId: boletim.id,
        code: plano.codigo,
        name: plano.descricao || null,
        description: plano.descricao || null,
        sortOrder: ordem,
      });

      plano.takes.forEach((take) => {
        const numero = Number(take.numero);
        takes.push({
          ...base,
          id: take.id,
          setupId: plano.id,
          number: Number.isFinite(numero) ? numero : 0,
          status: 'RECORDED',
          kind: take.natureza || 'SYNC',
        });
        dados.push({
          ...base,
          id: `som-${take.id}`,
          takeId: take.id,
          status: take.julgamento || null,
          circled: take.julgamento === 'CIRCLE',
          ngReason: take.motivoNG || null,
          soundRoll: take.rolo || null,
          fileName: take.arquivo || null,
          tcStart: take.tcInicio || null,
          tcEnd: take.tcFim || null,
          durationSec: duracaoEmSegundos(take.duracao),
          issues: escreveProblemas(take.problemas),
          issueNotes: take.obsProblemas || null,
          notes: take.observacoes || null,
        });
        take.canais.forEach((canal, indice) => {
          tracks.push({
            ...base,
            id: canal.id,
            takeId: take.id,
            index: Number(canal.indice) || indice + 1,
            name: canal.nome || null,
            source: canal.microfone || null,
            pickup: canal.captacao || null,
          });
        });
      });
    });
  });

  const rolls: LocalSoundRoll[] = boletim.rolos
    .filter((rolo) => rolo.rotulo.trim())
    .map((rolo) => ({
      ...base,
      id: rolo.id,
      shootingDayId: boletim.id,
      label: rolo.rotulo.trim(),
      media: rolo.midia || null,
      recorder: rolo.equipamento || null,
      notes: rolo.observacoes || null,
    }));

  const formato = boletim.tecnica.formato.trim();
  const config: LocalSoundDayConfig = {
    ...base,
    id: `config-${boletim.id}`,
    shootingDayId: boletim.id,
    sampleRate: boletim.tecnica.sampleRate || null,
    bitDepth: boletim.tecnica.bitDepth || null,
    frameRate: boletim.tecnica.frameRate || null,
    timecodeSource: boletim.tecnica.timecode || null,
    fileFormat: formato || null,
    recorder: boletim.tecnica.gravador || null,
    soundMixer: boletim.equipe.mixer || null,
    boomOperator: boletim.equipe.boom || null,
    notes: boletim.observacoesGerais || null,
  };

  const cabecalho: CabecalhoImpressao = {
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
      notes: null,
    },
    equipe: [
      ...(boletim.equipe.mixer
        ? [{ id: 'mixer', nome: boletim.equipe.mixer, funcao: 'Técnico de som' }]
        : []),
      ...(boletim.equipe.boom
        ? [{ id: 'boom', nome: boletim.equipe.boom, funcao: 'Microfonista' }]
        : []),
    ],
  };

  return { fonte: { cenas, setups, takes, dados, tracks }, rolls, config, cabecalho };
}
