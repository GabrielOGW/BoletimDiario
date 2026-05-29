'use client';

import { useId } from 'react';
import { cn } from '@/utils/cn';

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Realça em verde quando ligado (ex.: aprovação). */
  emphasis?: 'brand' | 'approved';
  description?: string;
  className?: string;
}

export function Toggle({
  label,
  checked,
  onChange,
  emphasis = 'brand',
  description,
  className,
}: ToggleProps) {
  const id = useId();
  const onColor = emphasis === 'approved' ? 'bg-approved' : 'bg-brand';

  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 transition',
        checked && emphasis === 'approved' && 'border-approved/50 bg-approved-soft',
        className,
      )}
    >
      <span className="flex flex-col">
        <span className="text-[15px] font-medium text-zinc-100">{label}</span>
        {description ? (
          <span className="text-xs text-zinc-500">{description}</span>
        ) : null}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
          checked ? onColor : 'bg-zinc-700',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 transform rounded-full bg-white shadow transition',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </label>
  );
}
