'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';

import { SectionCard } from '@/components/layout/SectionCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ClapperboardIcon, PrinterIcon, WifiOffIcon, XIcon } from '@/components/ui/icons';
import { listCameraTakeData } from '@/lib/offline/repos/camera';
import {
  getDailyProgressReport,
  listContinuityTakeData,
} from '@/lib/offline/repos/continuidade';
import { isPinned, listScenes, listSetups, listTakes } from '@/lib/offline/repos/diaria';
import { listSoundTakeData } from '@/lib/offline/repos/som';
import { fetchAndPin, startSync } from '@/lib/sync/engine';
import { agrupaCenas } from '@/features/diaria/cenas';
import { NovaCena } from '@/features/diaria/NovaCena';
import { ConflictList } from '@/features/sync/ConflictList';
import type { CabecalhoImpressao } from '@/features/camera/FolhaCamera';
import { cn } from '@/utils/cn';
import { useLembraDiaria } from '@/features/diaria/useLembraDiaria';

import { CenaContinuidade } from './CenaContinuidade';
import { FolhaContinuidade, type DocumentoImpresso } from './FolhaContinuidade';
import { RelatorioProgresso } from './RelatorioProgresso';
import { contagensDoDia, linhasDaContinuidade } from './estrutura';

/**
 * O Boletim de Continuidade na plataforma — dentro da fronteira offline.
 *
 * Mesmo formato dos outros dois módulos (ADR-024). O que é próprio daqui:
 *
 * - **os metadados da cena** são preenchidos neste módulo e consumidos pelos outros (§1);
 * - o cartão do take mostra **lente, T-stop e roll lidos dos outros departamentos** (§34) —
 *   a continuísta lê o que a câmera registrou em vez de copiar, e copiar é onde o erro
 *   acontece;
 * - o **Relatório de Progresso da Diária** é fechado aqui, com metade dele já contada.
 */
export function ContinuidadeDiaria({
  productionId,
  shootingDayId,
  canEdit,
  cabecalho,
  impressao,
}: {
  productionId: string;
  shootingDayId: string;
  canEdit: boolean;
  cabecalho: React.ReactNode;
  impressao: CabecalhoImpressao;
}) {
  // Fase 11: esta tela passa a ser "onde eu estava" — o botão Continuar da tela
  // inicial, da barra da sala e do menu longo do ícone lê exatamente isto.
  useLembraDiaria({
    productionId,
    shootingDayId,
    modulo: 'continuidade',
    producao: impressao.producao.name,
    data: impressao.diaria.date,
    dayNumber: impressao.diaria.dayNumber,
  });

  const [fixacao, setFixacao] = useState<'CARREGANDO' | 'PRONTA' | 'SEM_REDE'>(
    'CARREGANDO',
  );
  const [folha, setFolha] = useState<DocumentoImpresso | null>(null);

  useEffect(() => {
    if (!folha) return;
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setFolha(null);
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
  const idsDosTakes = useMemo(() => (takes ?? []).map((take) => take.id), [takes]);

  const dados = useLiveQuery(
    () => listContinuityTakeData(idsDosTakes),
    [idsDosTakes],
    [],
  );
  // Lidos dos outros departamentos: o mesmo `take_id` aponta para os três (§34).
  const camera = useLiveQuery(() => listCameraTakeData(idsDosTakes), [idsDosTakes], []);
  const som = useLiveQuery(() => listSoundTakeData(idsDosTakes), [idsDosTakes], []);
  const relatorio = useLiveQuery(
    () => getDailyProgressReport(shootingDayId),
    [shootingDayId],
    undefined,
  );

  const fonte = useMemo(
    () => ({
      cenas: cenas ?? [],
      setups: setups ?? [],
      takes: takes ?? [],
      dados: dados ?? [],
      camera: camera ?? [],
      som: som ?? [],
    }),
    [cenas, setups, takes, dados, camera, som],
  );

  /** A leitura única: tela, folha de continuidade e relatório de progresso saem daqui. */
  const linhas = useMemo(() => linhasDaContinuidade(fonte), [fonte]);
  const contagens = useMemo(() => contagensDoDia(fonte), [fonte]);

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

  return (
    <>
      <div className={cn('flex flex-col gap-4', folha && 'no-print')}>
        <ConflictList productionId={productionId} />

        {cabecalho}

        <SectionCard
          title="Cenas"
          icon={<ClapperboardIcon size={18} />}
          action={canEdit ? <NovaCena productionId={productionId} /> : null}
        >
          {agrupadas.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Nenhuma cena nesta diária ainda. Crie a primeira — os metadados de cena são
              preenchidos aqui e lidos pelos outros departamentos.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {agrupadas.map((cena) => (
                <CenaContinuidade
                  key={cena.numero}
                  numero={cena.numero}
                  blocos={cena.blocos}
                  setups={(setups ?? []).filter((setup) =>
                    cena.blocos.some((bloco) => bloco.id === setup.sceneId),
                  )}
                  takes={takes ?? []}
                  dados={dados ?? []}
                  camera={camera ?? []}
                  som={som ?? []}
                  productionId={productionId}
                  canEdit={canEdit}
                />
              ))}
            </div>
          )}
        </SectionCard>

        <RelatorioProgresso
          productionId={productionId}
          shootingDayId={shootingDayId}
          relatorio={relatorio}
          contagens={contagens}
          canEdit={canEdit}
          onImprimir={() => setFolha('PROGRESSO')}
        />

        <Button
          variant="secondary"
          fullWidth
          leftIcon={<PrinterIcon size={18} />}
          onClick={() => setFolha('CONTINUIDADE')}
        >
          Ver boletim de continuidade
        </Button>
      </div>

      {folha ? (
        <FolhaImpressa
          onFechar={() => setFolha(null)}
          documento={folha}
          cabecalho={impressao}
          linhas={linhas}
          contagens={contagens}
          relatorio={relatorio}
        />
      ) : null}
    </>
  );
}

/**
 * A folha em sobreposição, na mesma rota — como nos outros módulos.
 *
 * O botão troca entre os dois documentos sem fechar: no wrap, quem imprime um costuma
 * imprimir o outro em seguida, e sair da camada para voltar custaria dois toques e uma
 * rolagem até o mesmo lugar.
 */
function FolhaImpressa({
  onFechar,
  ...dados
}: React.ComponentProps<typeof FolhaContinuidade> & { onFechar: () => void }) {
  const [documento, setDocumento] = useState(dados.documento);
  const outro = documento === 'CONTINUIDADE' ? 'PROGRESSO' : 'CONTINUIDADE';

  return (
    <div className="print-overlay fixed inset-0 z-40 overflow-y-auto bg-ink/95 px-3 py-4 backdrop-blur-sm">
      <div className="no-print mx-auto mb-3 flex w-full max-w-[820px] flex-wrap items-center gap-2">
        <Button variant="secondary" leftIcon={<XIcon size={16} />} onClick={onFechar}>
          Fechar
        </Button>
        <Button variant="ghost" onClick={() => setDocumento(outro)}>
          {outro === 'PROGRESSO' ? 'Ver progresso do dia' : 'Ver continuidade'}
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

      <FolhaContinuidade {...dados} documento={documento} />
    </div>
  );
}
