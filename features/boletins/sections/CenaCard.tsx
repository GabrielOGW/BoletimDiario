'use client';

import { useState } from 'react';
import type { Bloco, Cena } from '@/types/boletim';
import { BlocoCard } from '@/features/boletins/sections/BlocoCard';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Badge } from '@/components/ui/Badge';
import { createBloco, duplicateBloco } from '@/lib/factory';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CopyIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/ui/icons';
import { cn } from '@/utils/cn';

interface CenaCardProps {
  cena: Cena;
  index: number;
  total: number;
  onChange: (next: Cena) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function nextLetter(blocos: Bloco[]): string {
  const used = new Set(blocos.map((bloco) => bloco.letra.toUpperCase()));
  for (const letter of ALPHABET) if (!used.has(letter)) return letter;
  return '';
}

export function CenaCard({
  cena,
  index,
  total,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
}: CenaCardProps) {
  const [open, setOpen] = useState(() => cena.numero.trim() === '');

  let planosCount = 0;
  let approvedCount = 0;
  for (const bloco of cena.blocos) {
    planosCount += bloco.planos.length;
    for (const plano of bloco.planos) {
      approvedCount += plano.takes.filter((take) => take.aprovado).length;
    }
  }

  const addBloco = () =>
    onChange({ ...cena, blocos: [...cena.blocos, createBloco(nextLetter(cena.blocos))] });
  const changeBloco = (blocoId: string, next: Bloco) =>
    onChange({
      ...cena,
      blocos: cena.blocos.map((bloco) => (bloco.id === blocoId ? next : bloco)),
    });
  const removeBloco = (blocoId: string) =>
    onChange({ ...cena, blocos: cena.blocos.filter((bloco) => bloco.id !== blocoId) });
  const duplicateBlocoById = (blocoId: string) => {
    const sourceIndex = cena.blocos.findIndex((bloco) => bloco.id === blocoId);
    if (sourceIndex < 0) return;
    const blocos = [...cena.blocos];
    blocos.splice(sourceIndex + 1, 0, duplicateBloco(cena.blocos[sourceIndex]));
    onChange({ ...cena, blocos });
  };
  const moveBloco = (blocoIndex: number, dir: -1 | 1) => {
    const target = blocoIndex + dir;
    if (target < 0 || target >= cena.blocos.length) return;
    const blocos = [...cena.blocos];
    const [item] = blocos.splice(blocoIndex, 1);
    blocos.splice(target, 0, item);
    onChange({ ...cena, blocos });
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-surface-hover"
      >
        <ChevronDownIcon
          size={20}
          className={cn('shrink-0 text-zinc-400 transition', open && 'rotate-180')}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className="text-sm font-semibold uppercase tracking-wide text-brand">
              Cena
            </span>
            <span className="truncate text-base font-semibold text-white">
              {cena.numero.trim() || 'sem número'}
            </span>
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">
              {cena.blocos.length} {cena.blocos.length === 1 ? 'bloco' : 'blocos'}
            </Badge>
            <Badge tone="neutral">
              {planosCount} {planosCount === 1 ? 'plano' : 'planos'}
            </Badge>
            {approvedCount > 0 ? (
              <Badge tone="approved">
                <CheckCircleIcon size={12} />
                {approvedCount} aprovado{approvedCount > 1 ? 's' : ''}
              </Badge>
            ) : null}
          </span>
        </span>
      </button>

      {open ? (
        <div className="space-y-4 border-t border-line p-4">
          <div className="flex items-center gap-2">
            <IconButton
              label="Mover cena para cima"
              variant="surface"
              icon={<ArrowUpIcon size={18} />}
              disabled={index === 0}
              onClick={() => onMove(-1)}
            />
            <IconButton
              label="Mover cena para baixo"
              variant="surface"
              icon={<ArrowDownIcon size={18} />}
              disabled={index === total - 1}
              onClick={() => onMove(1)}
            />
            <div className="flex-1" />
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<CopyIcon size={16} />}
              onClick={onDuplicate}
            >
              Duplicar
            </Button>
            <IconButton
              label="Excluir cena"
              variant="danger"
              icon={<TrashIcon size={20} />}
              onClick={onRemove}
            />
          </div>

          <TextField
            label="Número / Nome da cena"
            value={cena.numero}
            onChange={(v) => onChange({ ...cena, numero: v })}
            placeholder="Ex.: 18"
          />

          <div className="space-y-3">
            {cena.blocos.map((bloco, blocoIndex) => (
              <BlocoCard
                key={bloco.id}
                bloco={bloco}
                index={blocoIndex}
                total={cena.blocos.length}
                onChange={(next) => changeBloco(bloco.id, next)}
                onRemove={() => removeBloco(bloco.id)}
                onDuplicate={() => duplicateBlocoById(bloco.id)}
                onMove={(dir) => moveBloco(blocoIndex, dir)}
              />
            ))}
          </div>

          <Button
            variant="primary"
            fullWidth
            leftIcon={<PlusIcon size={18} />}
            onClick={addBloco}
          >
            Adicionar bloco
          </Button>
        </div>
      ) : null}
    </div>
  );
}
