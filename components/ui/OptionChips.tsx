'use client';

import { cn } from '@/utils/cn';

export interface OptionChip {
  valor: string;
  rotulo: string;
}

interface OptionChipsProps {
  /** Rótulo do grupo — lido por leitor de tela, opcionalmente visível. */
  label: string;
  showLabel?: boolean;
  options: readonly OptionChip[];
  /** O valor marcado, ou `null`. */
  value: string | null;
  /**
   * Tocar de novo no mesmo chip limpa a escolha. Em set, desfazer não pode custar um menu
   * — e é por isso que o retorno pode ser `null`.
   */
  onChange: (valor: string | null) => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
}

const SIZES = {
  sm: 'min-h-[32px] px-2.5 text-xs',
  /** ≥ 44 px: alvo de toque de quem está com uma mão no mixer. */
  md: 'min-h-[44px] flex-1 px-3 text-sm',
} as const;

/**
 * Fileira de escolha única por **um toque**, sem modal e sem confirmação.
 *
 * O gesto que o boletim de câmera já usava para o julgamento do take, agora componente:
 * o Som precisa exatamente dele para status e natureza, e uma segunda implementação viraria
 * um dialeto do design system (ADR-024).
 */
export function OptionChips({
  label,
  showLabel,
  options,
  value,
  onChange,
  size = 'md',
  disabled,
  className,
}: OptionChipsProps) {
  return (
    <div
      className={cn('flex items-center gap-2', className)}
      role="group"
      aria-label={label}
    >
      {showLabel ? (
        <span aria-hidden className="text-xs text-zinc-500">
          {label}:
        </span>
      ) : null}

      {options.map((option) => {
        const marcado = value === option.valor;
        return (
          <button
            key={option.valor}
            type="button"
            aria-pressed={marcado}
            disabled={disabled}
            onClick={() => onChange(marcado ? null : option.valor)}
            className={cn(
              'rounded-lg border font-medium transition',
              SIZES[size],
              marcado
                ? 'border-brand/60 bg-brand-soft text-zinc-100'
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
