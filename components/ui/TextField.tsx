'use client';

import { useId } from 'react';
import type { HTMLInputTypeAttribute } from 'react';
import { XIcon } from '@/components/ui/icons';
import { cn } from '@/utils/cn';

interface TextFieldProps {
  label: string;
  /** Controlado (boletim). Omitido, o campo é do `<form>` — ver `name`/`defaultValue`. */
  value?: string;
  onChange?: (value: string) => void;
  /**
   * Modo não controlado, para os formulários que enviam direto a uma Server Action:
   * o valor pertence ao `<form>`, e um `useState` por campo só faria o mesmo trabalho
   * duas vezes. Sem `value`, o botão de limpar não aparece — ele precisa saber se há
   * texto, e aqui não há como saber sem virar controlado de novo.
   */
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  type?: HTMLInputTypeAttribute;
  /** Sugestões para <datalist> sem travar a digitação. */
  options?: readonly string[];
  hint?: string;
  /** Mensagem de erro. Substitui o `hint` e marca o campo como inválido. */
  error?: string;
  inputMode?: 'text' | 'numeric' | 'decimal' | 'tel';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  /** Necessário para gerenciadores de senha reconhecerem o campo. */
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
  /** Mostra o botão "x" para apagar rápido (padrão: true em campos de texto). */
  clearable?: boolean;
  className?: string;
}

const NATIVE_PICKER_TYPES = new Set(['date', 'time', 'month', 'week', 'datetime-local']);

export function TextField({
  label,
  value,
  onChange,
  name,
  defaultValue,
  placeholder,
  type = 'text',
  options,
  hint,
  error,
  inputMode,
  autoCapitalize,
  autoComplete,
  required,
  disabled,
  clearable = true,
  className,
}: TextFieldProps) {
  const id = useId();
  const listId = options ? `${id}-list` : undefined;
  const messageId = error || hint ? `${id}-message` : undefined;
  const showClear =
    clearable &&
    !disabled &&
    !NATIVE_PICKER_TYPES.has(type) &&
    value !== undefined &&
    value.length > 0;

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
          name={name}
          defaultValue={defaultValue}
          list={listId}
          placeholder={placeholder}
          inputMode={inputMode}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          onChange={(event) => onChange?.(event.target.value)}
          className={cn(
            'h-12 w-full rounded-xl border border-line bg-surface px-3.5 text-base text-zinc-100',
            'transition placeholder:text-zinc-600',
            'focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/30',
            'disabled:cursor-not-allowed disabled:opacity-60',
            error && 'border-red-500/70 focus:border-red-500 focus:ring-red-500/30',
            showClear && 'pr-12',
          )}
        />
        {showClear ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Limpar ${label}`}
            onClick={() => onChange?.('')}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-zinc-400 transition hover:text-white"
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
      {error ? (
        <p id={messageId} className="text-xs text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-zinc-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
