'use client';

import { useState, type ReactNode } from 'react';

import { ChevronDownIcon } from '@/components/ui/icons';
import { cn } from '@/utils/cn';

/**
 * Seção dobrada dentro de um cartão de take, com o resumo no próprio rótulo — o mesmo gesto
 * de "Mídia" no take da Câmera e de "Canais" no do Som. Um cartão com tudo aberto estoura a
 * tela antes do primeiro plano.
 */
export function Dobra({
  titulo,
  resumo,
  destaque,
  children,
}: {
  titulo: string;
  resumo?: string;
  destaque?: boolean;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((valor) => !valor)}
        className="flex min-h-[44px] w-full items-center gap-2 text-left text-xs text-zinc-400 hover:text-zinc-300"
      >
        <ChevronDownIcon
          size={14}
          className={cn('shrink-0 transition', aberto && 'rotate-180')}
        />
        <span className="shrink-0">{titulo}</span>
        {resumo ? (
          <span className={cn('truncate', destaque ? 'text-amber-400' : 'text-zinc-400')}>
            {resumo}
          </span>
        ) : null}
      </button>
      {aberto ? <div className="mt-1">{children}</div> : null}
    </div>
  );
}
