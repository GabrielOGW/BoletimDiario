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

  /**
   * Recolhível, o `<h2>` **envolve** o botão em vez de sumir.
   *
   * Dentro de `<button>` não cabe `<h2>` — botão só aceita conteúdo de frase —, e a
   * primeira solução foi trocar por `<span>`. O efeito colateral era caro e invisível:
   * um cartão recolhível deixava de ser um cabeçalho, e a tela de diária, que é feita
   * quase só deles, virava uma lista sem estrutura para quem navega por cabeçalhos.
   *
   * O padrão certo é o inverso — cabeçalho por fora, botão por dentro (Fase 10). O
   * `<span>` continua existindo para o caso não recolhível, onde o `<h2>` é o próprio
   * título.
   */
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
            <span className="text-xs font-normal normal-case text-zinc-400">
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
        <h2>
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
        </h2>
      ) : (
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          {headerContent}
        </div>
      )}
      {showBody ? (
        <div className={cn('p-4', bodyClassName)}>
          {children}
          {/* Recolhível, o cabeçalho inteiro é um <button> — e link dentro de botão é
              HTML inválido. Em vez de a ação sumir em silêncio (era o que acontecia com
              os "Editar na sala" das telas de diária), ela desce para o fim do corpo. */}
          {collapsible && action ? <div className="mt-3">{action}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
