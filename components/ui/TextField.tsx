'use client';

import { useId } from 'react';
import type { HTMLInputTypeAttribute } from 'react';
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
  className?: string;
}

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
  className,
}: TextFieldProps) {
  const id = useId();
  const listId = options ? `${id}-list` : undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={id}
        className="text-xs font-medium uppercase tracking-wide text-zinc-400"
      >
        {label}
      </label>
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
        )}
      />
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
