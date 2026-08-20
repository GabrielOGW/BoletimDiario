'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';

import { SectionCard } from '@/components/layout/SectionCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  ClapperboardIcon,
  DownloadIcon,
  FileTextIcon,
  PrinterIcon,
  WifiOffIcon,
  XIcon,
} from '@/components/ui/icons';
import { isPinned, listScenes, listSetups, listTakes } from '@/lib/offline/repos/diaria';
import {
  getSoundDayConfig,
  listSoundTakeData,
  listSoundTracks,
} from '@/lib/offline/repos/som';
import { fetchAndPin, startSync } from '@/lib/sync/engine';
import { agrupaCenas } from '@/features/diaria/cenas';
import { NovaCena } from '@/features/diaria/NovaCena';
import { ConflictList } from '@/features/sync/ConflictList';
import type { CabecalhoImpressao } from '@/features/camera/FolhaCamera';
import { cn } from '@/utils/cn';
import { useLembraDiaria } from '@/features/diaria/useLembraDiaria';
import { baixaCSV } from '@/utils/download';

import { CenaSom } from './CenaSom';
import { ConfiguracaoSom } from './ConfiguracaoSom';
import { FolhaSom } from './FolhaSom';
import { linhasDoRelatorio, resumoDoDia } from './estrutura';
import { montaCSV, nomeDoArquivo } from './csv';

/**
 * O Boletim de Som na plataforma — dentro da fronteira offline.
 *
 * Mesmo formato do módulo de Câmera, de propósito (ADR-024): a fixação da diária, o
 * indicador de pendências, os cartões colapsáveis, o auto-save sem botão salvar e a folha
 * A4 em sobreposição na própria rota. O que muda é o que se escreve no take — e é só isso
 * que devia mudar entre dois departamentos anotando a mesma diária.
 *
 * O Som **não cria cena nem plano** no dia a dia: ele enxerga o que a Câmera registrou e
 * anexa dados ao mesmo take (sound.md §1). Criar continua possível para quando o Som chega
 * primeiro — playback, wild track, room tone antes de a câmera rodar.
 */
export function SomDiaria({
  productionId,
  shootingDayId,
  canEdit,
  cabecalho,
  impressao,
}: {
  productionId: string;
  shootingDayId: string;
  canEdit: boolean;
  /** Produção, horários e equipe, já resolvidos no servidor. Somente leitura. */
  cabecalho: React.ReactNode;
  /** Os mesmos dados de sala, em texto puro, para a folha impressa. */
  impressao: CabecalhoImpressao;
}) {
  // Fase 11: esta tela passa a ser "onde eu estava" — o botão Continuar da tela
  // inicial, da barra da sala e do menu longo do ícone lê exatamente isto.
  useLembraDiaria({
    productionId,
    shootingDayId,
    modulo: 'som',
    producao: impressao.producao.name,
    data: impressao.diaria.date,
    dayNumber: impressao.diaria.dayNumber,
  });

  const [fixacao, setFixacao] = useState<'CARREGANDO' | 'PRONTA' | 'SEM_REDE'>(
    'CARREGANDO',
  );
  const [folha, setFolha] = useState(false);

  // Fechar com Esc: a folha é uma camada sobre a diária, e sair dela não pode custar
  // procurar um botão com a mão ocupada.
  useEffect(() => {
    if (!folha) return;
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setFolha(false);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [folha]);

  useEffect(() => {
    const parar = startSync(productionId, 'DIARIA');

    void (async () => {
      if (await isPinned(shootingDayId)) {
        setFixacao('PRONTA');
        void fetchAndPin(shootingDayId).catch(() => undefined);
        return;
      }
      try {
        await fetchAndPin(shootingDayId);
        setFixacao('PRONTA');
      } catch {
        setFixacao('SEM_REDE');
      }
    })();

    return parar;
  }, [productionId, shootingDayId]);

  const cenas = useLiveQuery(() => listScenes(productionId), [productionId], []);
  const setups = useLiveQuery(() => listSetups(shootingDayId), [shootingDayId], []);
  const takes = useLiveQuery(
    () => listTakes((setups ?? []).map((setup) => setup.id)),
    [setups],
    [],
  );
  const dados = useLiveQuery(
    () => listSoundTakeData((takes ?? []).map((take) => take.id)),
    [takes],
    [],
  );
  const tracks = useLiveQuery(
    () => listSoundTracks((takes ?? []).map((take) => take.id)),
    [takes],
    [],
  );
  const config = useLiveQuery(
    () => getSoundDayConfig(shootingDayId),
    [shootingDayId],
    undefined,
  );

  /**
   * A leitura única da diária: tela, folha e CSV saem **daqui**.
   *
   * Três leituras seriam três verdades sobre o mesmo dia, e a que a pós receberia seria
   * justamente a menos olhada.
   */
  const linhas = useMemo(
    () =>
      linhasDoRelatorio({
        cenas: cenas ?? [],
        setups: setups ?? [],
        takes: takes ?? [],
        dados: dados ?? [],
        tracks: tracks ?? [],
      }),
    [cenas, setups, takes, dados, tracks],
  );

  if (fixacao === 'CARREGANDO') {
    return (
      <p className="px-1 py-8 text-center text-sm text-zinc-400">Abrindo o boletim…</p>
    );
  }

  if (fixacao === 'SEM_REDE') {
    return (
      <EmptyState
        icon={<WifiOffIcon size={40} />}
        title="Esta diária ainda não foi baixada"
        description="Conecte-se uma vez para poder trabalhar nela sem rede. Depois disso, ela abre em locação sem sinal."
        action={
          <Button variant="primary" onClick={() => window.location.reload()}>
            Tentar de novo
          </Button>
        }
      />
    );
  }

  const agrupadas = agrupaCenas(cenas ?? []);
  const resumo = resumoDoDia(linhas);

  const contexto = {
    projeto: impressao.producao.name,
    data: impressao.diaria.date,
  };

  return (
    <>
      <div className={cn('flex flex-col gap-4', folha && 'no-print')}>
        <ConflictList productionId={productionId} />

        {cabecalho}

        <ConfiguracaoSom
          productionId={productionId}
          shootingDayId={shootingDayId}
          config={config}
          canEdit={canEdit}
        />

        <SectionCard
          title="Cenas"
          icon={<ClapperboardIcon size={18} />}
          action={canEdit ? <NovaCena productionId={productionId} /> : null}
        >
          {agrupadas.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Nenhuma cena nesta diária ainda. Elas aparecem aqui assim que a Câmera (ou
              você) registrar a primeira — o take é o mesmo para os dois departamentos.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {agrupadas.map((cena) => (
                <CenaSom
                  key={cena.numero}
                  numero={cena.numero}
                  blocos={cena.blocos}
                  setups={(setups ?? []).filter((setup) =>
                    cena.blocos.some((bloco) => bloco.id === setup.sceneId),
                  )}
                  takes={takes ?? []}
                  dados={dados ?? []}
                  tracks={tracks ?? []}
                  productionId={productionId}
                  shootingDayId={shootingDayId}
                  canEdit={canEdit}
                />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Som do dia" icon={<FileTextIcon size={18} />}>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Numero rotulo="Takes" valor={resumo.takes} />
            <Numero rotulo="Com som" valor={resumo.comSom} />
            <Numero rotulo="Circled" valor={resumo.circled} destaque="approved" />
            <Numero rotulo="MOS" valor={resumo.mos} destaque="warning" />
          </dl>
          <p className="mt-3 text-xs text-zinc-400">
            Contados a partir dos takes — não há dois números divergentes na mesma tela.
            MOS é take rodado sem som, e conta como registrado, não como esquecido.
          </p>
        </SectionCard>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="secondary"
            fullWidth
            leftIcon={<PrinterIcon size={18} />}
            onClick={() => setFolha(true)}
          >
            Ver sound report
          </Button>
          <Button
            variant="secondary"
            fullWidth
            leftIcon={<DownloadIcon size={18} />}
            disabled={linhas.length === 0}
            onClick={() => baixaCSV(montaCSV(linhas, contexto), nomeDoArquivo(contexto))}
          >
            Baixar CSV
          </Button>
        </div>
      </div>

      {folha ? (
        <FolhaImpressa
          onFechar={() => setFolha(false)}
          cabecalho={impressao}
          config={config}
          linhas={linhas}
        />
      ) : null}
    </>
  );
}

function Numero({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: number;
  destaque?: 'approved' | 'warning';
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-400">{rotulo}</dt>
      <dd
        className={cn(
          'text-lg font-semibold text-zinc-100',
          destaque === 'approved' && 'text-approved',
          destaque === 'warning' && valor > 0 && 'text-amber-400',
        )}
      >
        {valor}
      </dd>
    </div>
  );
}

/**
 * A folha em sobreposição, na **mesma rota** da diária — como no módulo de Câmera.
 *
 * Navegar exigiria buscar o servidor, e o momento de fechar o boletim é exatamente o
 * momento em que a locação não tem sinal.
 */
function FolhaImpressa({
  onFechar,
  ...dados
}: React.ComponentProps<typeof FolhaSom> & { onFechar: () => void }) {
  return (
    <div className="print-overlay fixed inset-0 z-40 overflow-y-auto bg-ink/95 px-3 py-4 backdrop-blur-sm">
      <div className="no-print mx-auto mb-3 flex w-full max-w-[820px] items-center gap-2">
        <Button variant="secondary" leftIcon={<XIcon size={16} />} onClick={onFechar}>
          Fechar
        </Button>
        <span className="flex-1" />
        <Button
          variant="primary"
          leftIcon={<PrinterIcon size={18} />}
          onClick={() => window.print()}
        >
          Imprimir / PDF
        </Button>
      </div>

      <FolhaSom {...dados} />
    </div>
  );
}
