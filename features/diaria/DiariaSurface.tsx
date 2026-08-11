'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';

import { SectionCard } from '@/components/layout/SectionCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import {
  ClapperboardIcon,
  PlusIcon,
  TrashIcon,
  WifiOffIcon,
} from '@/components/ui/icons';
import { TAKE_STATUS_LABEL, TAKE_STATUSES } from '@/domain/platform/enums';
import {
  createScene,
  createSetup,
  createTake,
  isPinned,
  listScenes,
  listSetups,
  listTakes,
  nextTakeNumber,
  patchEntity,
  softDelete,
} from '@/lib/offline/repos/diaria';
import { fetchAndPin, startSync, syncNow } from '@/lib/sync/engine';
import { ConflictList } from '@/features/sync/ConflictList';

/**
 * A superfície de diária da Fase 4 — cena → setup → take, compartilhados.
 *
 * É a **prova do sync**, não o módulo de câmera: o consumidor pequeno que faz a fila, o
 * cursor e o conflito existirem de verdade antes de o módulo maduro ser migrado
 * (Fase 5). Nada aqui faz `fetch` — só `lib/offline/repos/*` e o motor.
 */
export function DiariaSurface({
  productionId,
  shootingDayId,
  canEdit,
  podeAnotar,
}: {
  productionId: string;
  shootingDayId: string;
  canEdit: boolean;
  /** Falso para quem não é de Câmera, Som ou Continuidade — ADR-031. */
  podeAnotar: boolean;
}) {
  const [fixacao, setFixacao] = useState<'CARREGANDO' | 'PRONTA' | 'SEM_REDE'>(
    'CARREGANDO',
  );

  useEffect(() => {
    const parar = startSync(productionId, 'DIARIA');

    void (async () => {
      // Já fixada abre na hora, sem rede. Não fixada precisa de uma conexão — uma vez.
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

  // Sem departamento com módulo não há o que anotar, então a tela é de leitura —
  // independentemente do papel na sala (ADR-031).
  const editavel = canEdit && podeAnotar;

  const cenas = useLiveQuery(() => listScenes(productionId), [productionId], []);
  const setups = useLiveQuery(() => listSetups(shootingDayId), [shootingDayId], []);
  const takes = useLiveQuery(
    () => listTakes((setups ?? []).map((setup) => setup.id)),
    [setups],
    [],
  );

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
        description="Conecte-se uma vez para poder trabalhar nela sem rede. Depois disso, ela abre em locação sem sinal."
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
      {podeAnotar ? (
        <p className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-xs leading-relaxed text-zinc-500">
          Base compartilhada entre Câmera, Som e Continuidade — ainda em construção. O{' '}
          <a href="/" className="text-zinc-300 underline underline-offset-2">
            Boletim de Câmera
          </a>{' '}
          continua funcionando exatamente como antes.
        </p>
      ) : (
        <p className="rounded-xl border border-brand/30 bg-brand-soft px-3.5 py-3 text-sm leading-relaxed text-zinc-200">
          Você está cadastrado apenas para gestão. Ainda não é possível fazer anotações do
          seu departamento no app — mas você continua vendo tudo que Câmera, Som e
          Continuidade registram.
        </p>
      )}

      <ConflictList productionId={productionId} />

      {editavel ? (
        <NovoSetup
          productionId={productionId}
          shootingDayId={shootingDayId}
          cenas={(cenas ?? []).map((cena) => ({
            id: cena.id,
            rotulo: `Cena ${cena.number}${cena.block ?? ''}`,
          }))}
          proximaOrdem={(setups ?? []).length}
        />
      ) : null}

      {(setups ?? []).length === 0 ? (
        <EmptyState
          icon={<ClapperboardIcon size={40} />}
          title="Nenhum setup nesta diária"
          description={
            editavel
              ? 'Crie o primeiro setup para começar a marcar takes.'
              : 'Você tem acesso de leitura a esta diária.'
          }
        />
      ) : null}

      {(setups ?? []).map((setup) => {
        const cena = (cenas ?? []).find((item) => item.id === setup.sceneId);
        const doSetup = (takes ?? []).filter((take) => take.setupId === setup.id);

        return (
          <SectionCard
            key={setup.id}
            title={`${cena ? `Cena ${cena.number}${cena.block ?? ''} · ` : ''}Setup ${setup.code}`}
            summary={`${doSetup.length} take(s)`}
            action={
              editavel ? (
                <Button
                  size="sm"
                  variant="primary"
                  leftIcon={<PlusIcon size={15} />}
                  onClick={async () => {
                    await createTake({
                      productionId,
                      setupId: setup.id,
                      number: await nextTakeNumber(setup.id),
                    });
                    syncNow();
                  }}
                >
                  Take
                </Button>
              ) : null
            }
          >
            {doSetup.length === 0 ? (
              <p className="text-sm text-zinc-500">Sem takes ainda.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {doSetup.map((take) => (
                  <TakeRow key={take.id} take={take} canEdit={editavel} />
                ))}
              </ul>
            )}
          </SectionCard>
        );
      })}
    </div>
  );
}

function TakeRow({
  take,
  canEdit,
}: {
  take: {
    id: string;
    number: number;
    status: string;
    notes?: string | null;
    _dirty: 0 | 1;
  };
  canEdit: boolean;
}) {
  const [notas, setNotas] = useState(take.notes ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce de 500 ms com flush no unmount — o mesmo contrato do boletim de câmera, que
  // é o que faz o app não ter botão salvar. A coalescência da fila cuida do resto.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function alteraNotas(valor: string) {
    setNotas(valor);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void patchEntity('take', take.id, { notes: valor || null }).then(syncNow);
    }, 500);
  }

  return (
    <li className="rounded-xl border border-line bg-surface p-3">
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-semibold text-zinc-100">
          Take {take.number}
        </span>
        {take._dirty ? <Badge tone="muted">não enviado</Badge> : null}
        <span className="flex-1" />
        {canEdit ? (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Excluir take ${take.number}`}
            className="text-red-400"
            onClick={() => void softDelete('take', take.id).then(syncNow)}
          >
            <TrashIcon size={16} />
          </Button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <SelectField
          label="Status"
          value={take.status}
          disabled={!canEdit}
          options={TAKE_STATUSES.map((status) => ({
            value: status,
            label: TAKE_STATUS_LABEL[status],
          }))}
          onChange={(valor) =>
            void patchEntity('take', take.id, { status: valor }).then(syncNow)
          }
        />
        <TextField
          label="Notas"
          value={notas}
          onChange={alteraNotas}
          disabled={!canEdit}
          placeholder="Observação do take"
        />
      </div>
    </li>
  );
}

/**
 * Criar setup — e, se preciso, a cena junto.
 *
 * Criar cena aqui não é atalho: em set, o setup nasce quando a câmera é posicionada, e
 * exigir que alguém tenha cadastrado a cena antes travaria o preenchimento no momento
 * em que ele mais precisa ser rápido.
 */
function NovoSetup({
  productionId,
  shootingDayId,
  cenas,
  proximaOrdem,
}: {
  productionId: string;
  shootingDayId: string;
  cenas: { id: string; rotulo: string }[];
  proximaOrdem: number;
}) {
  const [cenaId, setCenaId] = useState('');
  const [numeroCena, setNumeroCena] = useState('');
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');

  async function criar() {
    setErro('');
    const code = codigo.trim().toUpperCase();
    if (!code) return setErro('Informe o código do setup (A, B, C…).');

    let alvo = cenaId;
    if (!alvo) {
      const numero = numeroCena.trim();
      if (!numero) return setErro('Escolha uma cena ou informe o número de uma nova.');
      alvo = await createScene({ productionId, number: numero });
    }

    await createSetup({
      productionId,
      sceneId: alvo,
      shootingDayId,
      code,
      sortOrder: proximaOrdem,
    });

    setCodigo('');
    setNumeroCena('');
    syncNow();
  }

  return (
    <SectionCard
      title="Novo setup"
      collapsible
      defaultOpen={false}
      summary="Cena e código"
    >
      <div className="flex flex-col gap-4">
        <SelectField
          label="Cena"
          value={cenaId}
          onChange={setCenaId}
          options={[
            { value: '', label: 'Nova cena…' },
            ...cenas.map((cena) => ({ value: cena.id, label: cena.rotulo })),
          ]}
        />

        {cenaId === '' ? (
          <TextField
            label="Número da cena"
            value={numeroCena}
            onChange={setNumeroCena}
            placeholder="24"
          />
        ) : null}

        <TextField
          label="Código do setup"
          value={codigo}
          onChange={setCodigo}
          placeholder="A"
          autoCapitalize="characters"
          error={erro}
        />

        <Button variant="primary" fullWidth onClick={() => void criar()}>
          Criar setup
        </Button>
      </div>
    </SectionCard>
  );
}
