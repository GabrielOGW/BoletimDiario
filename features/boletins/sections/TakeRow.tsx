'use client';

import { useId } from 'react';
import type { Take } from '@/types/boletim';
import { IconButton } from '@/components/ui/IconButton';
import { CheckIcon, TrashIcon } from '@/components/ui/icons';
import { useEditorMeta } from '@/hooks/useSuggestions';
import { cn } from '@/utils/cn';

interface TakeRowProps {
  take: Take;
  onChange: (patch: Partial<Take>) => void;
  onRemove: () => void;
}

const inputBase =
  'h-11 rounded-lg border border-line bg-surface px-3 text-base text-zinc-100 placeholder:text-zinc-600 transition focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/30';

export function TakeRow({ take, onChange, onRemove }: TakeRowProps) {
  const { suggestions } = useEditorMeta();
  const cartaoListId = useId();
  const clipListId = useId();

  return (
    <li
      className={cn(
        'rounded-xl border p-3 transition',
        take.aprovado
          ? 'border-approved/60 bg-approved-soft'
          : 'border-line bg-surface-raised',
      )}
    >
      <div className="flex items-center gap-2">
        <input
          aria-label="Número do take"
          value={take.numero}
          inputMode="numeric"
          placeholder="Nº"
          onChange={(event) => onChange({ numero: event.target.value })}
          className={cn(inputBase, 'w-14 shrink-0 text-center font-semibold')}
        />
        <input
          aria-label="Nota operacional do take"
          value={take.notaOperacional}
          placeholder="Nota operacional (boom, foco, série…)"
          onChange={(event) => onChange({ notaOperacional: event.target.value })}
          className={cn(inputBase, 'min-w-0 flex-1')}
        />
        <IconButton
          label="Remover take"
          variant="danger"
          icon={<TrashIcon size={20} />}
          onClick={onRemove}
        />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          aria-label="Cartão do take"
          value={take.cartao}
          list={cartaoListId}
          placeholder="Cartão (ex.: A010)"
          onChange={(event) => onChange({ cartao: event.target.value })}
          className={cn(inputBase, 'w-full')}
        />
        <datalist id={cartaoListId}>
          {suggestions.cartao.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
        <input
          aria-label="Clip / Sync do take"
          value={take.clipSync}
          list={clipListId}
          placeholder="Clip / Sync"
          onChange={(event) => onChange({ clipSync: event.target.value })}
          className={cn(inputBase, 'w-full')}
        />
        <datalist id={clipListId}>
          {suggestions.clipSync.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={take.aprovado}
        onClick={() => onChange({ aprovado: !take.aprovado })}
        className={cn(
          'mt-2.5 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-approved focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
          take.aprovado
            ? 'border-approved bg-approved text-ink'
            : 'border-line bg-surface text-zinc-300 hover:border-approved/50 hover:text-approved',
        )}
      >
        <CheckIcon size={18} />
        {take.aprovado ? 'Aprovado pelo diretor' : 'Marcar como aprovado'}
      </button>
    </li>
  );
}
