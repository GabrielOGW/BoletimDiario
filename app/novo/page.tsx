'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createEmptyBoletim } from '@/lib/factory';
import { upsert } from '@/lib/storage';

/** Cria um boletim em branco e redireciona para o editor. */
export default function NovoPage() {
  const router = useRouter();
  const created = useRef(false);

  useEffect(() => {
    if (created.current) return;
    created.current = true;
    const boletim = upsert(createEmptyBoletim());
    router.replace(`/editar?id=${boletim.id}`);
  }, [router]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink text-sm text-zinc-500">
      Criando boletim…
    </div>
  );
}
