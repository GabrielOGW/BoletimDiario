'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDownIcon } from '@/components/ui/icons';
import { cn } from '@/utils/cn';

interface SectionCardProps {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Permite recolher/expandir a seção. */
  collapsible?: boolean;
  /** Estado inicial quando recolhível (padrão: aberto). */
  defaultOpen?: boolean;
  /** Resumo curto exibido no cabeçalho quando recolhido (ex.: "2 cartões"). */
  summary?: ReactNode;
}

/** Cartão de seção do formulário: cabeçalho com ícone + corpo (opcionalmente recolhível). */
export function SectionCard({
  title,
  icon,
  action,
  children,
  className,
  bodyClassName,
  collapsible = false,
  defaultOpen = true,
  summary,
}: SectionCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const showBody = !collapsible || open;

  // Dentro de <button> não pode haver <h2> (conteúdo não-phrasing) → usa <span>.
  const Title = collapsible ? 'span' : 'h2';

  const headerContent = (
    <>
      {icon ? <span className="text-brand">{icon}</span> : null}
      <Title className="flex-1 text-sm font-semibold uppercase tracking-wide text-zinc-200">
        {title}
      </Title>
      {collapsible ? (
        <>
          {!open && summary ? (
            <span className="text-xs font-normal normal-case text-zinc-500">
              {summary}
            </span>
          ) : null}
          <ChevronDownIcon
            size={20}
            className={cn('text-zinc-400 transition', open && 'rotate-180')}
          />
        </>
      ) : (
        action
      )}
    </>
  );

  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-line bg-surface',
        className,
      )}
    >
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className={cn(
            'flex w-full items-center gap-2.5 px-4 py-3 text-left transition hover:bg-surface-hover active:bg-surface-hover',
            showBody && 'border-b border-line',
          )}
        >
          {headerContent}
        </button>
      ) : (
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          {headerContent}
        </div>
      )}
      {showBody ? <div className={cn('p-4', bodyClassName)}>{children}</div> : null}
    </section>
  );
}
