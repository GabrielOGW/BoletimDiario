'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  definicaoDoModulo,
  type ModuloDeDepartamento,
} from '@/features/diaria/departamentos';
import { cn } from '@/utils/cn';

/**
 * O cartão de um boletim na tela inicial — o **mesmo** para Câmera, Continuidade e Som.
 *
 * Faixa na cor do departamento, o nome do departamento por extenso (a cor nunca é o único
 * rótulo), o título e uma linha de resumo. Tocar abre o editor; as ações ficam à direita,
 * como ícones de 44 px. Um componente só para os três: dois desenhos de cartão divergiriam
 * na primeira mudança.
 */
export function CartaoDeBoletim({
  modulo,
  href,
  titulo,
  resumo,
  acoes,
}: {
  modulo: ModuloDeDepartamento;
  href: string;
  titulo: string;
  resumo: string;
  acoes: ReactNode;
}) {
  const definicao = definicaoDoModulo(modulo);

  return (
    <li
      className={cn(
        'flex items-stretch overflow-hidden rounded-2xl border bg-surface',
        definicao?.cor.borda,
      )}
    >
      <span aria-hidden className={cn('w-1.5 shrink-0', definicao?.cor.faixa)} />
      <Link
        href={href}
        className="min-w-0 flex-1 px-4 py-3 transition hover:bg-surface-hover"
      >
        <span
          className={cn(
            'block text-xs font-semibold uppercase tracking-wide',
            definicao?.cor.texto,
          )}
        >
          {definicao?.nome}
        </span>
        <span className="block truncate text-[15px] font-semibold text-zinc-100">
          {titulo}
        </span>
        <span className="block text-xs leading-snug text-zinc-400">{resumo}</span>
      </Link>
      <div className="flex items-center pr-1">{acoes}</div>
    </li>
  );
}
