'use client';

import { cn } from '@/utils/cn';

import type { OptionChip } from './OptionChips';

/**
 * Fileira de **múltipla** escolha, um toque por chip — o par de `OptionChips`.
 *
 * Existe porque problema de captação não é escolha única: um take pode ter avião **e**
 * lapela raspando. Mesmo visual, mesmo alvo de toque, mesmo `aria-pressed`; muda só que
 * marcar um não desmarca o outro (ADR-024: uma segunda fileira com outro desenho seria um
 * dialeto do design system).
 */
export function ToggleChips({
  label,
  options,
  values,
  onToggle,
  disabled,
  className,
}: {
  label: string;
  options: readonly OptionChip[];
  values: readonly string[];
  onToggle: (valor: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-wrap gap-2', className)}
      role="group"
      aria-label={label}
    >
      {options.map((option) => {
        const marcado = values.includes(option.valor);
        return (
          <button
            key={option.valor}
            type="button"
            aria-pressed={marcado}
            disabled={disabled}
            onClick={() => onToggle(option.valor)}
            className={cn(
              'min-h-[44px] rounded-lg border px-3 text-sm font-medium transition',
              marcado
                ? 'border-amber-500/60 bg-amber-500/15 text-zinc-100'
                : 'border-line bg-surface-raised text-zinc-400 hover:bg-surface-hover',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            {option.rotulo}
          </button>
        );
      })}
    </div>
  );
}
