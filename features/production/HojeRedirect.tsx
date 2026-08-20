'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { hojeLocal } from '@/lib/atalhos';

/**
 * Diz ao servidor que dia é hoje — **no fuso de quem está em locação**.
 *
 * `/hoje` não pode perguntar isso ao banco: a diária é dia civil e nunca vira UTC (R9), e
 * às 21h de Brasília o servidor já está no dia seguinte. Então a primeira coisa que a rota
 * faz é devolver esta linha, que recarrega a si mesma com `?d=` preenchido pelo relógio do
 * aparelho. É um salto invisível — nenhum toque a mais — e é o que faz o atalho abrir a
 * diária certa em vez da de amanhã.
 */
export function HojeRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/hoje?d=${hojeLocal()}`);
  }, [router]);

  return (
    <p className="px-1 py-8 text-center text-sm text-zinc-500">
      Abrindo a diária de hoje…
    </p>
  );
}
