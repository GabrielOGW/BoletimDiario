'use client';

import { useEffect } from 'react';
import { runMigrations } from '@/lib/migrate';
import { ensureSeed } from '@/lib/seed';
import { ensureSeedLocal } from '@/lib/local/seed';

/**
 * Inicialização client-side:
 * 1. migra boletins antigos (v1 → v2) uma única vez;
 * 2. semeia o boletim demo na primeira visita;
 * 3. semeia os demos de Som e Continuidade, uma vez por aparelho (ADR-043).
 */
export function AppBootstrap() {
  useEffect(() => {
    runMigrations();
    ensureSeed();
    ensureSeedLocal();
  }, []);
  return null;
}
