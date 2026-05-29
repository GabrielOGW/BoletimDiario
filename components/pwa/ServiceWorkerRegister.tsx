'use client';

import { useEffect } from 'react';

/**
 * Registra o Service Worker (apenas em produção, para não interferir no HMR
 * do `next dev`). Para testar offline localmente: `npm run build && npm start`.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Falha no registro não deve quebrar o app — ele continua funcionando online.
      });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}
