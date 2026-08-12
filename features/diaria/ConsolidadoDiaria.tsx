'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';

import { SectionCard } from '@/components/layout/SectionCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchInput } from '@/components/ui/SearchInput';
import { WifiOffIcon } from '@/components/ui/icons';
import { listCameraTakeData, listCameraUnits } from '@/lib/offline/repos/camera';
import { listContinuityTakeData } from '@/lib/offline/repos/continuidade';
import { isPinned, listScenes, listSetups, listTakes } from '@/lib/offline/repos/diaria';
import { listSoundTakeData } from '@/lib/offline/repos/som';
import { fetchAndPin, startSync } from '@/lib/sync/engine';
import { cn } from '@/utils/cn';

import { filtraLinhas, lacunasDoDia, linhasConsolidadas } from './consolidado';
import type { ColunaDoTake, LinhaConsolidada } from './consolidado';

/**
 * A visão consolidada da diária — um take, os três departamentos, lado a lado.
 *
 * **Dentro da fronteira offline** e somente leitura: tudo que ela mostra já está fixado no
 * banco local, então ela não acrescenta nem uma requisição. É a tela que responde "que
 * arquivo de som casa com este clip?" e "que take ficou sem som?" — perguntas que, com três
 * cadernos separados, só se responde no dia seguinte.
 *
 * A relação é por `take_id`: não há conciliação, e é exatamente para isso que o modelo
 * compartilhado existe.
 */
export function ConsolidadoDiaria({
  productionId,
  shootingDayId,
}: {
  productionId: string;
  shootingDayId: string;
}) {
  const [fixacao, setFixacao] = useState<'CARREGANDO' | 'PRONTA' | 'SEM_REDE'>(
    'CARREGANDO',
  );
  const [termo, setTermo] = useState('');

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

  const camera = useLiveQuery(() => listCameraTakeData(idsDosTakes), [idsDosTakes], []);
  const som = useLiveQuery(() => listSoundTakeData(idsDosTakes), [idsDosTakes], []);
  const continuidade = useLiveQuery(
    () => listContinuityTakeData(idsDosTakes),
    [idsDosTakes],
    [],
  );
  const cameras = useLiveQuery(() => listCameraUnits(productionId), [productionId], []);

  const linhas = useMemo(
    () =>
      linhasConsolidadas({
        cenas: cenas ?? [],
        setups: setups ?? [],
        takes: takes ?? [],
        camera: camera ?? [],
        cameras: cameras ?? [],
        som: som ?? [],
        continuidade: continuidade ?? [],
      }),
    [cenas, setups, takes, camera, cameras, som, continuidade],
  );

  const filtradas = useMemo(() => filtraLinhas(linhas, termo), [linhas, termo]);
  const lacunas = useMemo(() => lacunasDoDia(linhas), [linhas]);

  if (fixacao === 'CARREGANDO') {
    return (
      <p className="px-1 py-8 text-center text-sm text-zinc-500">Abrindo a diária…</p>
    );
  }

  if (fixacao === 'SEM_REDE') {
    return (
      <EmptyState
        icon={<WifiOffIcon size={40} />}
        title="Esta diária ainda não foi baixada"
        description="Conecte-se uma vez para poder consultá-la sem rede."
        action={
          <Button variant="primary" onClick={() => window.location.reload()}>
            Tentar de novo
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="O que falta">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Lacuna rotulo="Takes" valor={linhas.length} />
          {/* MOS não é lacuna: é take que declaradamente não tem áudio (ADR-029). */}
          <Lacuna rotulo="Sem som" valor={lacunas.semSom} alerta />
          <Lacuna rotulo="Sem câmera" valor={lacunas.semCamera} alerta />
          <Lacuna rotulo="Sem continuidade" valor={lacunas.semContinuidade} />
        </dl>
        <p className="mt-3 text-xs text-zinc-500">
          Contado dos três departamentos, pelo mesmo <code>take_id</code>. Take MOS não
          conta como &ldquo;sem som&rdquo; — ele foi rodado sem áudio de propósito.
        </p>
      </SectionCard>

      <SearchInput
        value={termo}
        onChange={setTermo}
        placeholder="Buscar cartão, arquivo, cena, nota…"
      />

      {linhas.length === 0 ? (
        <p className="px-1 text-sm text-zinc-500">
          Nenhum take nesta diária ainda. Assim que qualquer departamento registrar o
          primeiro, ele aparece aqui.
        </p>
      ) : filtradas.length === 0 ? (
        <p className="px-1 text-sm text-zinc-500">
          Nada encontrado para “{termo}”. A busca é local: ela funciona sem rede, mas só
          alcança esta diária.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtradas.map((linha) => (
            <LinhaDoTake key={linha.takeId} linha={linha} />
          ))}
        </div>
      )}
    </div>
  );
}

function Lacuna({
  rotulo,
  valor,
  alerta,
}: {
  rotulo: string;
  valor: number;
  alerta?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{rotulo}</dt>
      <dd
        className={cn(
          'text-lg font-semibold text-zinc-100',
          alerta && valor > 0 && 'text-amber-400',
        )}
      >
        {valor}
      </dd>
    </div>
  );
}

function LinhaDoTake({ linha }: { linha: LinhaConsolidada }) {
  return (
    <article className="rounded-xl border border-line bg-surface p-3">
      <header className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-zinc-100">
          Cena {linha.cena}
          {linha.bloco} · Plano {linha.plano} · Take {linha.take}
        </span>
        {linha.natureza ? (
          <Badge tone={linha.mos ? 'warning' : 'neutral'}>{linha.natureza}</Badge>
        ) : null}
      </header>

      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <Coluna titulo="Câmera" coluna={linha.camera} />
        <Coluna titulo="Som" coluna={linha.som} ausenteOk={linha.mos} />
        <Coluna titulo="Continuidade" coluna={linha.continuidade} />
      </div>
    </article>
  );
}

function Coluna({
  titulo,
  coluna,
  ausenteOk,
}: {
  titulo: string;
  coluna: ColunaDoTake;
  /** `true` quando a ausência é esperada — o som de um take MOS. */
  ausenteOk?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-2.5 py-2',
        coluna.destaque
          ? 'border-approved/40 bg-approved-soft'
          : 'border-line bg-surface-raised',
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {titulo}
      </p>

      {!coluna.anotou ? (
        <p
          className={cn('mt-0.5 text-xs', ausenteOk ? 'text-zinc-500' : 'text-amber-400')}
        >
          {ausenteOk ? 'MOS — sem áudio' : 'Sem anotação'}
        </p>
      ) : (
        <div className="mt-0.5 flex flex-col gap-0.5 text-xs">
          {coluna.arquivo ? (
            <span className="truncate font-mono text-zinc-200">{coluna.arquivo}</span>
          ) : null}
          {coluna.midia ? (
            <span className="truncate font-mono text-zinc-400">{coluna.midia}</span>
          ) : null}
          {coluna.julgamento ? (
            <span className="text-zinc-400">{coluna.julgamento}</span>
          ) : null}
          {coluna.nota ? <span className="text-zinc-400">{coluna.nota}</span> : null}
        </div>
      )}
    </div>
  );
}
