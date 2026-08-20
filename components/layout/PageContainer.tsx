import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/**
 * Container central mobile-first com respiro lateral e largura máxima legível.
 *
 * `as="main"` marca o **conteúdo** da tela (Fase 10). As telas do boletim legado já
 * tinham `<main>` desde sempre; as da plataforma nasceram sem, e o efeito é que quem
 * navega por leitor de tela não tem para onde pular — cai no topo e percorre o cabeçalho
 * a cada troca de rota. O padrão continua sendo `div` porque o próprio `AppHeader` usa
 * este container por dentro, e `<main>` dentro de `<header>` seria pior que nenhum.
 */
export function PageContainer({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'main';
}) {
  return (
    <Tag
      id={Tag === 'main' ? 'conteudo' : undefined}
      className={cn('mx-auto w-full max-w-2xl px-4', className)}
    >
      {children}
    </Tag>
  );
}
