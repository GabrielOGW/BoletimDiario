'use client';

import { useEffect } from 'react';

import { lembraDiaria } from '@/lib/atalhos';

/** `2026-08-19` → `19/08/2026`. Sem `Date`: a diária é dia civil, não instante (R9). */
function dataBR(date: string): string {
  const [ano, mes, dia] = date.split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : date;
}

/**
 * Marca esta tela como "onde eu estava" (Fase 11).
 *
 * Uma linha em cada módulo, e é o que faz o botão **Continuar** existir na tela inicial,
 * na barra da sala e no menu longo do ícone do app. Grava ao abrir, e não ao sair: quem
 * fecha o app em set fecha porque a bateria acabou ou porque guardou o celular no bolso —
 * não há evento de saída confiável para esperar.
 *
 * O rótulo é montado e gravado aqui porque quem lê o atalho pode estar **sem rede**: a
 * tela inicial precisa escrever "Diária 12 · 19/08/2026" sem perguntar nada ao servidor.
 */
export function useLembraDiaria(atalho: {
  productionId: string;
  shootingDayId: string;
  modulo: string;
  producao: string;
  data: string;
  dayNumber?: string | null;
}): void {
  const { productionId, shootingDayId, modulo, producao, data, dayNumber } = atalho;

  useEffect(() => {
    lembraDiaria({
      productionId,
      shootingDayId,
      modulo,
      producao,
      diaria: `${dayNumber ? `Diária ${dayNumber} · ` : ''}${dataBR(data)}`,
    });
  }, [productionId, shootingDayId, modulo, producao, data, dayNumber]);
}
