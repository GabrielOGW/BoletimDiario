'use client';

import { useId } from 'react';
import type { HTMLInputTypeAttribute } from 'react';
import { XIcon } from '@/components/ui/icons';
import { cn } from '@/utils/cn';

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: HTMLInputTypeAttribute;
  /** Sugestões para <datalist> sem travar a digitação. */
  options?: readonly string[];
  hint?: string;
  inputMode?: 'text' | 'numeric' | 'decimal' | 'tel';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  /** Mostra o botão "x" para apagar rápido (padrão: true em campos de texto). */
  clearable?: boolean;
  className?: string;
}

const NATIVE_PICKER_TYPES = new Set(['date', 'time', 'month', 'week', 'datetime-local']);

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  options,
  hint,
  inputMode,
  autoCapitalize,
  clearable = true,
  className,
}: TextFieldProps) {
  const id = useId();
  const listId = options ? `${id}-list` : undefined;
  const showClear = clearable && !NATIVE_PICKER_TYPES.has(type) && value.length > 0;

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label
        htmlFor={id}
        className="text-xs font-medium uppercase tracking-wide text-zinc-400"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={type}
          value={value}
          list={listId}
          placeholder={placeholder}
          inputMode={inputMode}
          autoCapitalize={autoCapitalize}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            'h-12 w-full rounded-xl border border-line bg-surface px-3.5 text-base text-zinc-100',
            'transition placeholder:text-zinc-600',
            'focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/30',
            showClear && 'pr-12',
          )}
        />
        {showClear ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Limpar ${label}`}
            onClick={() => onChange('')}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-zinc-500 transition hover:text-white"
          >
            <XIcon size={18} />
          </button>
        ) : null}
      </div>
      {options ? (
        <datalist id={listId}>
          {options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      ) : null}
      {hint ? <p className="text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}
