'use client';

import { useEffect, useState } from 'react';

/**
 * `true` somente após a montagem no cliente. Usado para evitar mismatch de
 * hidratação ao ler do LocalStorage (que não existe no SSR/SSG).
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
