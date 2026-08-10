'use client';

import type { ComponentProps } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/Button';

type SubmitButtonProps = ComponentProps<typeof Button> & {
  /** Rótulo enquanto a ação está no ar. Sem ele, repete o rótulo normal. */
  pendingLabel?: string;
};

/**
 * Botão de envio ciente do estado do formulário.
 *
 * `useFormStatus` em vez de um `useState` de "busy": ele vem do próprio `<form>`, então
 * não há estado para esquecer de desligar quando a ação falha. Em set isso importa — um
 * botão que fica travado em "Salvando…" parece app quebrado.
 */
export function SubmitButton({ pendingLabel, children, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  );
}
