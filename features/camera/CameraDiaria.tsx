'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';

import { SectionCard } from '@/components/layout/SectionCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { TextField } from '@/components/ui/TextField';
import {
  CameraIcon,
  ClapperboardIcon,
  FilmIcon,
  PlusIcon,
  WifiOffIcon,
} from '@/components/ui/icons';
import {
  createCameraUnit,
  listCameraTakeData,
  listCameraUnits,
  patchCameraUnit,
} from '@/lib/offline/repos/camera';
import { isPinned, listScenes, listSetups, listTakes } from '@/lib/offline/repos/diaria';
import { fetchAndPin, startSync, syncNow } from '@/lib/sync/engine';
import { ConflictList } from '@/features/sync/ConflictList';

import { CenaCard } from './CenaCard';

/**
 * O Boletim de Câmera na plataforma.
 *
 * A regra desta tela é ADR-030: **a paridade é de tela, não só de campo**. A hierarquia
 * visível continua sendo Cena → Bloco → Plano → Take, na mesma ordem de seções e com os
 * mesmos gestos. `Setup` é o nome do conceito no modelo; aqui ele se chama **Plano**,
 * como sempre se chamou.
 *
 * Produção, Horários e Equipe agora vivem na sala — são dados de servidor, fora da
 * fronteira offline. Aparecem aqui preenchidos e somente leitura, com link para editar,
 * porque duplicar a edição significaria esperar rede no meio da diária.
 */
export function CameraDiaria({
  productionId,
  shootingDayId,
  canEdit,
  cabecalho,
}: {
  productionId: string;
  shootingDayId: string;
  canEdit: boolean;
  /** Produção, horários e equipe, já resolvidos no servidor. Somente leitura. */
  cabecalho: React.ReactNode;
}) {
  const [fixacao, setFixacao] = useState<'CARREGANDO' | 'PRONTA' | 'SEM_REDE'>(
    'CARREGANDO',
  );

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
  const dadosCamera = useLiveQuery(
    () => listCameraTakeData((takes ?? []).map((take) => take.id)),
    [takes],
    [],
  );
  const cameras = useLiveQuery(() => listCameraUnits(productionId), [productionId], []);

  if (fixacao === 'CARREGANDO') {
    return (
      <p className="px-1 py-8 text-center text-sm text-zinc-500">Abrindo o boletim…</p>
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

  /**
   * Cena e Bloco são uma `Scene` só no modelo (ADR-002). Na tela eles voltam a ser dois
   * níveis, agrupados pelo número — é assim que a claquete fala e é assim que o boletim
   * sempre mostrou.
   */
  const porNumero = new Map<string, typeof cenas>();
  for (const cena of cenas ?? []) {
    const lista = porNumero.get(cena.number) ?? [];
    lista.push(cena);
    porNumero.set(cena.number, lista);
  }

  const numeros = [...porNumero.keys()].sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { numeric: true }),
  );

  const takesDaCena = (sceneIds: string[]) =>
    (takes ?? []).filter((take) =>
      (setups ?? []).some(
        (setup) => setup.id === take.setupId && sceneIds.includes(setup.sceneId),
      ),
    );

  const totalTakes = (takes ?? []).length;
  const takesAprovados = (dadosCamera ?? []).filter((dado) => dado.approved).length;

  return (
    <div className="flex flex-col gap-4">
      <ConflictList productionId={productionId} />

      {cabecalho}

      <CamerasSection
        productionId={productionId}
        cameras={cameras ?? []}
        canEdit={canEdit}
      />

      <SectionCard
        title="Cenas"
        icon={<ClapperboardIcon size={18} />}
        action={canEdit ? <NovaCena productionId={productionId} /> : null}
      >
        {numeros.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {canEdit
              ? 'Nenhuma cena ainda. Crie a primeira para começar o boletim.'
              : 'Nenhuma cena registrada nesta diária.'}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {numeros.map((numero) => (
              <CenaCard
                key={numero}
                numero={numero}
                blocos={porNumero.get(numero) ?? []}
                setups={(setups ?? []).filter((setup) =>
                  (porNumero.get(numero) ?? []).some((cena) => cena.id === setup.sceneId),
                )}
                takes={takesDaCena((porNumero.get(numero) ?? []).map((cena) => cena.id))}
                dadosCamera={dadosCamera ?? []}
                cameras={cameras ?? []}
                productionId={productionId}
                shootingDayId={shootingDayId}
                canEdit={canEdit}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Cenas do dia" icon={<FilmIcon size={18} />}>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Cenas</dt>
            <dd className="text-lg font-semibold text-zinc-100">{numeros.length}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Planos</dt>
            <dd className="text-lg font-semibold text-zinc-100">
              {(setups ?? []).length}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Takes</dt>
            <dd className="text-lg font-semibold text-zinc-100">{totalTakes}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Aprovados</dt>
            <dd className="text-lg font-semibold text-approved">{takesAprovados}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-zinc-500">
          Contados a partir dos takes — não há dois números divergentes na mesma tela.
        </p>
      </SectionCard>
    </div>
  );
}

/** Câmeras cadastradas da produção, com seleção rápida por plano — como no boletim. */
function CamerasSection({
  productionId,
  cameras,
  canEdit,
}: {
  productionId: string;
  cameras: { id: string; label: string; model?: string | null }[];
  canEdit: boolean;
}) {
  const [etiqueta, setEtiqueta] = useState('');

  return (
    <SectionCard
      title="Câmeras"
      icon={<CameraIcon size={18} />}
      collapsible
      defaultOpen={false}
      summary={
        cameras.length === 0
          ? 'Nenhuma'
          : cameras.map((camera) => camera.label).join(' · ')
      }
    >
      <div className="flex flex-col gap-3">
        {cameras.map((camera) => (
          <div key={camera.id} className="flex items-center gap-3">
            <span className="w-10 shrink-0 text-center text-base font-semibold text-brand">
              {camera.label}
            </span>
            <TextField
              label="Modelo"
              className="flex-1"
              value={camera.model ?? ''}
              disabled={!canEdit}
              onChange={(valor) =>
                void patchCameraUnit(camera.id, { model: valor }).then(syncNow)
              }
              placeholder="ARRI Alexa 35"
            />
          </div>
        ))}

        {canEdit ? (
          <div className="flex items-end gap-2">
            <TextField
              label="Nova câmera"
              className="flex-1"
              value={etiqueta}
              onChange={setEtiqueta}
              placeholder="A"
              autoCapitalize="characters"
            />
            <Button
              variant="secondary"
              leftIcon={<PlusIcon size={16} />}
              disabled={!etiqueta.trim()}
              onClick={async () => {
                await createCameraUnit({ productionId, label: etiqueta });
                setEtiqueta('');
                syncNow();
              }}
            >
              Cadastrar
            </Button>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

function NovaCena({ productionId }: { productionId: string }) {
  const [numero, setNumero] = useState('');
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <Button
        size="sm"
        variant="primary"
        leftIcon={<PlusIcon size={15} />}
        onClick={() => setAberto(true)}
      >
        Cena
      </Button>
    );
  }

  return (
    <div className="flex items-end gap-2">
      <TextField
        label="Nº"
        className="w-24"
        value={numero}
        onChange={setNumero}
        placeholder="24"
      />
      <Button
        size="sm"
        variant="primary"
        disabled={!numero.trim()}
        onClick={async () => {
          const { createScene } = await import('@/lib/offline/repos/diaria');
          // Bloco A por padrão, como `createCena` sempre fez no boletim.
          await createScene({ productionId, number: numero.trim(), block: 'A' });
          setNumero('');
          setAberto(false);
          syncNow();
        }}
      >
        Criar
      </Button>
    </div>
  );
}
