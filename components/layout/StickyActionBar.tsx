import type { ReactNode } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';

/** Barra de ações fixa no rodapé, respeitando a safe-area do dispositivo. */
export function StickyActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-30 border-t border-line bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <PageContainer className="flex items-center gap-3 py-3">{children}</PageContainer>
    </div>
  );
}
