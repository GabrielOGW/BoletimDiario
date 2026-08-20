import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

type Tone = 'neutral' | 'brand' | 'approved' | 'muted' | 'warning';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-raised text-zinc-300 border border-line',
  brand: 'bg-brand-soft text-brand border border-brand/30',
  approved: 'bg-approved-soft text-approved border border-approved/40',
  muted: 'bg-transparent text-zinc-400 border border-line',
  /** Marca o que muda a leitura da linha — MOS, hoje. Nunca "algo deu errado". */
  warning: 'bg-amber-500/15 text-amber-400 border border-amber-500/40',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
