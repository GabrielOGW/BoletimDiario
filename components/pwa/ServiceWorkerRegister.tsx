'use client';

import { useEffect, useState } from 'react';

/**
 * Registra o Service Worker (apenas em produção, para não interferir no HMR do
 * `next dev`). Para testar offline localmente: `npm run build && npm start`.
 *
 * Também vigia a chegada de uma versão nova. O SW novo **não** assume sozinho: trocar de
 * versão no meio de uma diária recarregaria a tela sob os dedos de quem está preenchendo.
 * Ele espera, e o usuário decide — mas precisa saber que existe, senão fica preso numa
 * versão antiga sem nunca entender por quê (ADR-026).
 */
export function ServiceWorkerRegister() {
  const [esperando, setEsperando] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const observa = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting) setEsperando(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const novo = reg.installing;
        if (!novo) return;
        novo.addEventListener('statechange', () => {
          // `controller` presente significa que já havia uma versão rodando: é
          // atualização, não primeira instalação.
          if (novo.state === 'installed' && navigator.serviceWorker.controller) {
            setEsperando(novo);
          }
        });
      });
    };

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then(observa)
        .catch(() => {
          // Falha no registro não quebra o app — ele continua funcionando online.
        });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => window.removeEventListener('load', register);
  }, []);

  if (!esperando) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={() => {
          esperando.postMessage('SKIP_WAITING');
          // O `controllerchange` chega depois do skipWaiting; recarregar ali evita a
          // janela em que a página velha já perdeu o SW antigo.
          navigator.serviceWorker.addEventListener(
            'controllerchange',
            () => window.location.reload(),
            { once: true },
          );
        }}
        className="rounded-xl border border-brand/40 bg-brand px-4 py-3 text-sm font-semibold text-ink shadow-lg"
      >
        Nova versão disponível · Atualizar agora
      </button>
    </div>
  );
}
