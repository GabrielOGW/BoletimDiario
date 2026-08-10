'use client';

import { useId } from 'react';
import { ChevronDownIcon } from '@/components/ui/icons';
import { cn } from '@/utils/cn';

interface SelectFieldProps {
  label: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options: readonly { value: string; label: string }[];
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * `<select>` nativo com a moldura do `TextField`.
 *
 * Nativo de propósito: no celular, em set, o seletor do sistema é maior, mais rápido e
 * funciona com uma mão suja de fita — nenhum dropdown desenhado chega perto.
 */
export function SelectField({
  label,
  name,
  value,
  defaultValue,
  onChange,
  options,
  hint,
  required,
  disabled,
  className,
}: SelectFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label
        htmlFor={id}
        className="text-xs font-medium uppercase tracking-wide text-zinc-400"
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          name={name}
          value={value}
          defaultValue={defaultValue}
          required={required}
          disabled={disabled}
          aria-describedby={hintId}
          onChange={(event) => onChange?.(event.target.value)}
          className={cn(
            'h-12 w-full appearance-none rounded-xl border border-line bg-surface px-3.5 pr-11 text-base text-zinc-100',
            'transition focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/30',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          size={18}
          className="pointer-events-none absolute inset-y-0 right-3.5 my-auto text-zinc-500"
        />
      </div>
      {hint ? (
        <p id={hintId} className="text-xs text-zinc-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
