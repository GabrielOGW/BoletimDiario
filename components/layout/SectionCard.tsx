import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface SectionCardProps {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** Cartão de seção do formulário: cabeçalho com ícone + corpo. */
export function SectionCard({
  title,
  icon,
  action,
  children,
  className,
  bodyClassName,
}: SectionCardProps) {
  return (
    <section className={cn('rounded-2xl border border-line bg-surface', className)}>
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        {icon ? <span className="text-brand">{icon}</span> : null}
        <h2 className="flex-1 text-sm font-semibold uppercase tracking-wide text-zinc-200">
          {title}
        </h2>
        {action}
      </div>
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}
