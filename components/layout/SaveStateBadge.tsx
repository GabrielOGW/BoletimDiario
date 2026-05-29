'use client';

import type { SaveState } from '@/hooks/useBoletim';
import { CheckIcon } from '@/components/ui/icons';
import { cn } from '@/utils/cn';

/** Indicador discreto do auto-save (Salvando… / Salvo). */
export function SaveStateBadge({ state }: { state: SaveState }) {
  const isSaving = state === 'saving';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition',
        isSaving ? 'bg-brand-soft text-brand' : 'bg-approved-soft text-approved',
      )}
    >
      {isSaving ? (
        <>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
          Salvando…
        </>
      ) : (
        <>
          <CheckIcon size={13} />
          Salvo
        </>
      )}
    </span>
  );
}
