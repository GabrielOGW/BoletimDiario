import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon } from '@/components/ui/icons';
import { PageContainer } from '@/components/layout/PageContainer';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  right?: ReactNode;
}

/** Cabeçalho fixo no topo, com área de toque grande para voltar. */
export function AppHeader({ title, subtitle, backHref, right }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/85 backdrop-blur supports-[backdrop-filter]:bg-ink/70">
      <PageContainer className="flex h-16 items-center gap-2">
        {backHref ? (
          <Link
            href={backHref}
            aria-label="Voltar"
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-zinc-300 hover:bg-surface-hover hover:text-white"
          >
            <ArrowLeftIcon />
          </Link>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold leading-tight text-white">
            {title}
          </h1>
          {subtitle ? <p className="truncate text-xs text-zinc-500">{subtitle}</p> : null}
        </div>
        {right ? <div className="flex shrink-0 items-center gap-1">{right}</div> : null}
      </PageContainer>
    </header>
  );
}
