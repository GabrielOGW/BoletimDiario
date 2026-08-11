'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ChevronDownIcon, PlusIcon } from '@/components/ui/icons';
import type {
  LocalCameraTakeData,
  LocalCameraUnit,
  LocalScene,
  LocalSetup,
  LocalTake,
} from '@/lib/offline/db';
import { createScene, createSetup } from '@/lib/offline/repos/diaria';
import { syncNow } from '@/lib/sync/engine';
import { cn } from '@/utils/cn';

import { PlanoCard } from './PlanoCard';

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function proximaLetra(blocos: LocalScene[]): string {
  const usadas = new Set(blocos.map((bloco) => (bloco.block ?? '').toUpperCase()));
  for (const letra of ALFABETO) if (!usadas.has(letra)) return letra;
  return '';
}

interface CenaCardProps {
  numero: string;
  /** Os blocos da cena — no modelo, uma `Scene` por letra (ADR-002). */
  blocos: LocalScene[];
  setups: LocalSetup[];
  takes: LocalTake[];
  dadosCamera: LocalCameraTakeData[];
  cameras: LocalCameraUnit[];
  productionId: string;
  shootingDayId: string;
  canEdit: boolean;
}

/**
 * A Cena, com seus Blocos — os dois níveis que o boletim sempre mostrou.
 *
 * No modelo compartilhado, "cena 24 bloco B" é uma `Scene` só, com `number` e `block`
 * (ADR-002). A tela desfaz isso de volta em dois níveis porque é assim que a claquete
 * fala, e mudar o vocabulário do set para agradar ao modelo seria a regressão que
 * ADR-030 proíbe.
 */
export function CenaCard({
  numero,
  blocos,
  setups,
  takes,
  dadosCamera,
  cameras,
  productionId,
  shootingDayId,
  canEdit,
}: CenaCardProps) {
  const [aberto, setAberto] = useState(true);

  const ordenados = [...blocos].sort((a, b) =>
    (a.block ?? '').localeCompare(b.block ?? ''),
  );

  const planos = setups.length;
  const aprovados = dadosCamera.filter(
    (dado) => dado.approved && takes.some((take) => take.id === dado.takeId),
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
        {aprovados > 0 ? <Badge tone="approved">{aprovados} aprovado(s)</Badge> : null}
        <span className="text-xs text-zinc-500">
          {ordenados.length} bloco(s) · {planos} plano(s)
        </span>
        <ChevronDownIcon
          size={20}
          className={cn('text-zinc-400 transition', aberto && 'rotate-180')}
        />
      </button>

      {aberto ? (
        <div className="flex flex-col gap-3 p-3">
          {ordenados.map((bloco) => (
            <BlocoCard
              key={bloco.id}
              bloco={bloco}
              setups={setups.filter((setup) => setup.sceneId === bloco.id)}
              takes={takes}
              dadosCamera={dadosCamera}
              cameras={cameras}
              productionId={productionId}
              shootingDayId={shootingDayId}
              canEdit={canEdit}
            />
          ))}

          {canEdit ? (
            <Button
              variant="secondary"
              leftIcon={<PlusIcon size={16} />}
              onClick={async () => {
                await createScene({
                  productionId,
                  number: numero,
                  block: proximaLetra(ordenados),
                });
                syncNow();
              }}
            >
              Adicionar bloco
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function BlocoCard({
  bloco,
  setups,
  takes,
  dadosCamera,
  cameras,
  productionId,
  shootingDayId,
  canEdit,
}: {
  bloco: LocalScene;
  setups: LocalSetup[];
  takes: LocalTake[];
  dadosCamera: LocalCameraTakeData[];
  cameras: LocalCameraUnit[];
  productionId: string;
  shootingDayId: string;
  canEdit: boolean;
}) {
  const [aberto, setAberto] = useState(true);

  const ordenados = [...setups].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
  );

  /** O número do plano é sequencial dentro do bloco, como no boletim. */
  const proximoCodigo = String(ordenados.length + 1);

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((valor) => !valor)}
        className={cn(
          'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-surface-hover',
          aberto && 'border-b border-line',
        )}
      >
        <span className="text-sm font-semibold uppercase tracking-wide text-brand">
          Bloco {bloco.block ?? '—'}
        </span>
        <span className="flex-1" />
        <span className="text-xs text-zinc-500">{ordenados.length} plano(s)</span>
        <ChevronDownIcon
          size={18}
          className={cn('text-zinc-400 transition', aberto && 'rotate-180')}
        />
      </button>

      {aberto ? (
        <div className="flex flex-col gap-3 p-3">
          {ordenados.length === 0 ? (
            <p className="text-sm text-zinc-500">Sem planos neste bloco.</p>
          ) : null}

          {ordenados.map((setup) => (
            <PlanoCard
              key={setup.id}
              setup={setup}
              takes={takes
                .filter((take) => take.setupId === setup.id)
                .sort((a, b) => a.number - b.number)}
              dadosCamera={dadosCamera}
              cameras={cameras}
              productionId={productionId}
              canEdit={canEdit}
            />
          ))}

          {canEdit ? (
            <Button
              variant="ghost"
              leftIcon={<PlusIcon size={16} />}
              onClick={async () => {
                await createSetup({
                  productionId,
                  sceneId: bloco.id,
                  shootingDayId,
                  code: proximoCodigo,
                  sortOrder: ordenados.length,
                });
                syncNow();
              }}
            >
              Adicionar plano
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Editor do número da cena — usado pelo cartão quando o número precisa mudar. */
export function NumeroDaCena({
  valor,
  onChange,
  disabled,
}: {
  valor: string;
  onChange: (valor: string) => void;
  disabled?: boolean;
}) {
  return (
    <TextField
      label="Nº da cena"
      className="w-28"
      value={valor}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
