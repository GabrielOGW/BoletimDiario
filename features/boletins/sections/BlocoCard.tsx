'use client';

import type { Bloco, Plano } from '@/types/boletim';
import { PlanoCard } from '@/features/boletins/sections/PlanoCard';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Badge } from '@/components/ui/Badge';
import { createPlano, duplicatePlano } from '@/lib/factory';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/ui/icons';
import { cn } from '@/utils/cn';

interface BlocoCardProps {
  bloco: Bloco;
  index: number;
  total: number;
  onChange: (next: Bloco) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
}

export function BlocoCard({
  bloco,
  index,
  total,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
}: BlocoCardProps) {
  const addPlano = () =>
    onChange({
      ...bloco,
      planos: [...bloco.planos, createPlano(String(bloco.planos.length + 1))],
    });
  const changePlano = (planoId: string, next: Plano) =>
    onChange({
      ...bloco,
      planos: bloco.planos.map((plano) => (plano.id === planoId ? next : plano)),
    });
  const removePlano = (planoId: string) =>
    onChange({ ...bloco, planos: bloco.planos.filter((plano) => plano.id !== planoId) });
  const duplicatePlanoById = (planoId: string) =>
    onChange(
      (() => {
        const sourceIndex = bloco.planos.findIndex((plano) => plano.id === planoId);
        if (sourceIndex < 0) return bloco;
        const planos = [...bloco.planos];
        planos.splice(sourceIndex + 1, 0, duplicatePlano(bloco.planos[sourceIndex]));
        return { ...bloco, planos };
      })(),
    );
  const movePlano = (planoIndex: number, dir: -1 | 1) =>
    onChange(
      (() => {
        const target = planoIndex + dir;
        if (target < 0 || target >= bloco.planos.length) return bloco;
        const planos = [...bloco.planos];
        const [item] = planos.splice(planoIndex, 1);
        planos.splice(target, 0, item);
        return { ...bloco, planos };
      })(),
    );

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-center gap-2">
        <Badge tone="brand">Bloco</Badge>
        <input
          aria-label="Letra do bloco"
          value={bloco.letra}
          maxLength={4}
          placeholder="A"
          onChange={(event) =>
            onChange({ ...bloco, letra: event.target.value.toUpperCase() })
          }
          className={cn(
            'h-11 w-16 rounded-lg border border-line bg-surface-raised px-2 text-center text-base font-semibold uppercase text-zinc-100',
            'focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/30',
          )}
        />
        <div className="flex-1" />
        <IconButton
          label="Mover bloco para cima"
          variant="surface"
          icon={<ArrowUpIcon size={18} />}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        />
        <IconButton
          label="Mover bloco para baixo"
          variant="surface"
          icon={<ArrowDownIcon size={18} />}
          disabled={index === total - 1}
          onClick={() => onMove(1)}
        />
        <IconButton
          label="Duplicar bloco"
          variant="surface"
          icon={<CopyIcon size={18} />}
          onClick={onDuplicate}
        />
        <IconButton
          label="Excluir bloco"
          variant="danger"
          icon={<TrashIcon size={20} />}
          onClick={onRemove}
        />
      </div>

      <div className="space-y-2.5">
        {bloco.planos.map((plano, planoIndex) => (
          <PlanoCard
            key={plano.id}
            plano={plano}
            index={planoIndex}
            total={bloco.planos.length}
            onChange={(next) => changePlano(plano.id, next)}
            onRemove={() => removePlano(plano.id)}
            onDuplicate={() => duplicatePlanoById(plano.id)}
            onMove={(dir) => movePlano(planoIndex, dir)}
          />
        ))}
      </div>

      <Button
        variant="secondary"
        fullWidth
        leftIcon={<PlusIcon size={18} />}
        onClick={addPlano}
      >
        Adicionar plano
      </Button>
    </div>
  );
}
