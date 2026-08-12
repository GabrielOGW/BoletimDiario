'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ChevronDownIcon, PlusIcon } from '@/components/ui/icons';
import type {
  LocalScene,
  LocalSetup,
  LocalSoundTakeData,
  LocalSoundTakeTrack,
  LocalTake,
} from '@/lib/offline/db';
import {
  createSetup,
  createTake,
  nextTakeNumber,
  patchEntity,
} from '@/lib/offline/repos/diaria';
import { ensureSoundTakeData, ensureSoundTracks } from '@/lib/offline/repos/som';
import { syncNow } from '@/lib/sync/engine';
import { cn } from '@/utils/cn';

import { TakeSom } from './TakeSom';

/** O código do setup que recebe wild tracks e room tones da cena (sound.md §1). */
const CODIGO_WILD = 'WILD';

interface CenaSomProps {
  numero: string;
  blocos: LocalScene[];
  setups: LocalSetup[];
  takes: LocalTake[];
  dados: LocalSoundTakeData[];
  tracks: LocalSoundTakeTrack[];
  productionId: string;
  shootingDayId: string;
  canEdit: boolean;
}

/**
 * A cena vista pelo Som — a **mesma** hierarquia da Câmera, com outros campos dentro.
 *
 * Cena → Bloco → Plano → Take não é vocabulário da Câmera: é o da claquete, e é o que o
 * mixer ouve pelo intercom. Um módulo de Som que organizasse a diária de outro jeito
 * obrigaria as duas pessoas a traduzir uma para a outra o dia inteiro (ADR-024, ADR-030).
 */
export function CenaSom({
  numero,
  blocos,
  setups,
  takes,
  dados,
  tracks,
  productionId,
  shootingDayId,
  canEdit,
}: CenaSomProps) {
  const [aberto, setAberto] = useState(true);

  const ordenados = [...blocos].sort((a, b) =>
    (a.block ?? '').localeCompare(b.block ?? ''),
  );

  const takesDaCena = takes.filter((take) =>
    setups.some((setup) => setup.id === take.setupId),
  );
  const circled = dados.filter(
    (linha) => linha.circled && takesDaCena.some((take) => take.id === linha.takeId),
  ).length;

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface-raised">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((valor) => !valor)}
        className={cn(
          'flex w-full items-center gap-2.5 px-4 py-3 text-left transition hover:bg-surface-hover',
          aberto && 'border-b border-line',
        )}
      >
        <span className="text-base font-semibold text-zinc-100">Cena {numero}</span>
        <span className="flex-1" />
        {circled > 0 ? <Badge tone="approved">{circled} circled</Badge> : null}
        <span className="text-xs text-zinc-500">
          {ordenados.length} bloco(s) · {takesDaCena.length} take(s)
        </span>
        <ChevronDownIcon
          size={20}
          className={cn('text-zinc-400 transition', aberto && 'rotate-180')}
        />
      </button>

      {aberto ? (
        <div className="flex flex-col gap-3 p-3">
          {ordenados.map((bloco) => (
            <BlocoSom
              key={bloco.id}
              bloco={bloco}
              setups={setups.filter((setup) => setup.sceneId === bloco.id)}
              takes={takes}
              dados={dados}
              tracks={tracks}
              productionId={productionId}
              shootingDayId={shootingDayId}
              canEdit={canEdit}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function BlocoSom({
  bloco,
  setups,
  takes,
  dados,
  tracks,
  productionId,
  shootingDayId,
  canEdit,
}: {
  bloco: LocalScene;
  setups: LocalSetup[];
  takes: LocalTake[];
  dados: LocalSoundTakeData[];
  tracks: LocalSoundTakeTrack[];
  productionId: string;
  shootingDayId: string;
  canEdit: boolean;
}) {
  const ordenados = [...setups].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
  );

  const temWild = ordenados.some((setup) => setup.code === CODIGO_WILD);

  /**
   * Wild track e room tone não pertencem a plano nenhum, mas precisam de um lugar.
   *
   * Vão para um setup próprio da cena (§1) em vez de virarem hierarquia paralela: assim a
   * numeração, a herança e o relatório continuam funcionando sem nenhum caminho especial,
   * e o id derivado faz o Som e a Continuidade convergirem para o mesmo setup.
   */
  async function criaWild() {
    const setupId = await createSetup({
      productionId,
      sceneId: bloco.id,
      shootingDayId,
      code: CODIGO_WILD,
      name: 'Wild / room tone',
      sortOrder: 900,
    });
    await criaProximoTake({
      productionId,
      shootingDayId,
      setupId,
      kind: 'WILD',
    });
  }

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5">
        <span className="text-sm font-semibold uppercase tracking-wide text-brand">
          Bloco {bloco.block ?? '—'}
        </span>
        <span className="flex-1" />
        <span className="text-xs text-zinc-500">{ordenados.length} plano(s)</span>
      </div>

      <div className="flex flex-col gap-3 p-3">
        {ordenados.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Sem planos neste bloco. A Câmera cria os planos; o Som pode registrar wild
            tracks aqui de qualquer jeito.
          </p>
        ) : null}

        {ordenados.map((setup) => (
          <PlanoSom
            key={setup.id}
            setup={setup}
            takes={takes
              .filter((take) => take.setupId === setup.id)
              .sort((a, b) => a.number - b.number)}
            dados={dados}
            tracks={tracks}
            productionId={productionId}
            shootingDayId={shootingDayId}
            canEdit={canEdit}
          />
        ))}

        {canEdit && !temWild ? (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<PlusIcon size={15} />}
            onClick={() => void criaWild()}
          >
            Wild / room tone
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function PlanoSom({
  setup,
  takes,
  dados,
  tracks,
  productionId,
  shootingDayId,
  canEdit,
}: {
  setup: LocalSetup;
  takes: LocalTake[];
  dados: LocalSoundTakeData[];
  tracks: LocalSoundTakeTrack[];
  productionId: string;
  shootingDayId: string;
  canEdit: boolean;
}) {
  const [aberto, setAberto] = useState(true);

  const wild = setup.code === CODIGO_WILD;
  const titulo = wild ? 'Wild / room tone' : `Plano ${setup.code}`;

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface-raised">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((valor) => !valor)}
        className={cn(
          'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-surface-hover',
          aberto && 'border-b border-line',
        )}
      >
        <span className="text-sm font-semibold text-zinc-100">{titulo}</span>
        {setup.name && !wild ? (
          <span className="truncate text-xs text-zinc-500">{setup.name}</span>
        ) : null}
        <span className="flex-1" />
        <span className="text-xs text-zinc-500">{takes.length} take(s)</span>
        <ChevronDownIcon
          size={18}
          className={cn('text-zinc-400 transition', aberto && 'rotate-180')}
        />
      </button>

      {aberto ? (
        <div className="flex flex-col gap-2 p-3">
          {takes.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhum take neste plano ainda.</p>
          ) : null}

          {takes.map((take) => (
            <TakeSom
              key={take.id}
              take={take}
              dados={dados.find((linha) => linha.takeId === take.id)}
              tracks={tracks
                .filter((track) => track.takeId === take.id)
                .sort((a, b) => a.index - b.index)}
              productionId={productionId}
              shootingDayId={shootingDayId}
              setupId={setup.id}
              canEdit={canEdit}
            />
          ))}

          {canEdit ? (
            <Button
              variant="secondary"
              leftIcon={<PlusIcon size={16} />}
              onClick={() =>
                void criaProximoTake({
                  productionId,
                  shootingDayId,
                  setupId: setup.id,
                  kind: wild ? 'WILD' : undefined,
                })
              }
            >
              Próximo take
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * O take seguinte, já nascido preenchido.
 *
 * Número, roll, arquivo e canais vêm da regra de herança — nenhum deles é digitado de
 * novo (§30). Trocar de plano reseta a numeração porque ela é **por setup**, e isso mora
 * em `nextTakeNumber`, não aqui.
 */
async function criaProximoTake(input: {
  productionId: string;
  shootingDayId: string;
  setupId: string;
  kind?: string;
}): Promise<void> {
  const numero = await nextTakeNumber(input.setupId);

  const takeId = await createTake({
    productionId: input.productionId,
    setupId: input.setupId,
    number: numero,
  });

  // A natureza é do take compartilhado: um take criado no setup de wild já nasce `WILD`,
  // e a Câmera vai ler isso sem que ninguém precise avisar.
  if (input.kind) await patchEntity('take', takeId, { kind: input.kind });

  await ensureSoundTakeData({
    productionId: input.productionId,
    setupId: input.setupId,
    takeId,
    takeNumber: numero,
    shootingDayId: input.shootingDayId,
  });
  await ensureSoundTracks({
    productionId: input.productionId,
    shootingDayId: input.shootingDayId,
    setupId: input.setupId,
    takeId,
  });

  syncNow();
}
