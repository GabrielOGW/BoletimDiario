'use client';

import { useEffect } from 'react';
import { runMigrations } from '@/lib/migrate';
import { ensureSeed } from '@/lib/seed';

/**
 * Inicialização client-side:
 * 1. migra boletins antigos (v1 → v2) uma única vez;
 * 2. semeia o boletim demo na primeira visita.
 */
export function AppBootstrap() {
  useEffect(() => {
    runMigrations();
    ensureSeed();
  }, []);
  return null;
}
