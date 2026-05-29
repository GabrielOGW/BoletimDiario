import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

type Variant = 'ghost' | 'surface' | 'danger';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Rótulo acessível obrigatório (vira aria-label e title). */
  label: string;
  icon: ReactNode;
  variant?: Variant;
}

const VARIANTS: Record<Variant, string> = {
  ghost: 'text-zinc-300 hover:bg-surface-hover hover:text-white',
  surface: 'bg-surface-raised border border-line text-zinc-200 hover:bg-surface-hover',
  danger: 'text-red-400 hover:bg-red-500/15 hover:text-red-300',
};

export function IconButton({
  label,
  icon,
  variant = 'ghost',
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
        'disabled:cursor-not-allowed disabled:opacity-40',
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
}
