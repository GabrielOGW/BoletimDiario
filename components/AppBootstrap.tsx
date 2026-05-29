'use client';

import { useEffect } from 'react';
import { ensureSeed } from '@/lib/seed';

/** Inicialização client-side: semeia o boletim demo na primeira visita. */
export function AppBootstrap() {
  useEffect(() => {
    ensureSeed();
  }, []);
  return null;
}
