'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Boletim } from '@/types/boletim';
import { boletimTitle, computeStats } from '@/utils/boletim-stats';
import { formatDateBR, formatDateTimeBR } from '@/utils/date';
import { Badge } from '@/components/ui/Badge';
import { CheckCircleIcon, CopyIcon, EyeIcon, TrashIcon } from '@/components/ui/icons';
import { cn } from '@/utils/cn';

interface BoletimCardProps {
  boletim: Boletim;
  onView: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function CardAction({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-[48px] items-center justify-center gap-1.5 text-sm font-medium transition',
        danger
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-zinc-300 hover:bg-surface-hover hover:text-white',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function BoletimCard({
  boletim,
  onView,
  onDuplicate,
  onDelete,
}: BoletimCardProps) {
  const stats = computeStats(boletim);

  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-surface">
      <Link
        href={`/editar?id=${boletim.id}`}
        className="block p-4 transition hover:bg-surface-hover"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-white">
            {boletimTitle(boletim)}
          </h3>
          {stats.takesAprovados > 0 ? (
            <Badge tone="approved">
              <CheckCircleIcon size={12} />
              {stats.takesAprovados}
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-sm text-zinc-400">
          {boletim.producao.produtora || 'Sem produtora'}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Badge tone="muted">{formatDateBR(boletim.producao.data)}</Badge>
          {boletim.producao.diaDiaria ? (
            <Badge tone="muted">Diária {boletim.producao.diaDiaria}</Badge>
          ) : null}
          <Badge tone="neutral">{stats.totalCenas} cenas</Badge>
          <Badge tone="neutral">{stats.totalPlanos} planos</Badge>
          <Badge tone="neutral">{stats.totalTakes} takes</Badge>
        </div>
        <p className="mt-2.5 text-[11px] text-zinc-600">
          Atualizado em {formatDateTimeBR(boletim.updatedAt)}
        </p>
      </Link>
      <div className="grid grid-cols-3 divide-x divide-line border-t border-line">
        <CardAction icon={<EyeIcon size={17} />} label="Ver" onClick={onView} />
        <CardAction
          icon={<CopyIcon size={17} />}
          label="Duplicar"
          onClick={onDuplicate}
        />
        <CardAction
          icon={<TrashIcon size={17} />}
          label="Excluir"
          onClick={onDelete}
          danger
        />
      </div>
    </li>
  );
}
