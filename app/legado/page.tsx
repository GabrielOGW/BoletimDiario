import type { Metadata } from 'next';

import { BoletimListView } from '@/features/boletins/BoletimListView';

export const metadata: Metadata = { title: 'Boletim Diário de Câmera' };

/**
 * A casa do Boletim de Câmera local — o app inteiro que existia antes da plataforma.
 *
 * `/` renderiza exatamente esta tela (ver `app/page.tsx`): quem já usa o boletim não perde
 * um toque, e quem chega por link novo tem um endereço próprio. Os dois convivem até a
 * Fase 11 decidir o que `/` faz quando há sessão (ADR-032).
 */
export default function LegadoPage() {
  return <BoletimListView />;
}
