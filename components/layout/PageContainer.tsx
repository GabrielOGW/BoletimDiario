import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/** Container central mobile-first com respiro lateral e largura máxima legível. */
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('mx-auto w-full max-w-2xl px-4', className)}>{children}</div>;
}
