'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import { BoletimContinuidadeEditor } from '@/features/boletim-continuidade/BoletimContinuidadeEditor';

/**
 * O Boletim de Continuidade local (ADR-043) — mesma forma de `/legado/editar`: componente cliente lendo
 * `?id=`, estático, e no `APP_SHELL` do Service Worker para abrir sem rede.
 */
function Conteudo() {
  const params = useSearchParams();
  return <BoletimContinuidadeEditor id={params.get('id')} />;
}

export default function EditarPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-ink text-sm text-zinc-400">
          Carregando…
        </div>
      }
    >
      <Conteudo />
    </Suspense>
  );
}
