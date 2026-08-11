/* Service Worker — Boletim Audiovisual
 * Offline: precache do app shell + estratégias em runtime.
 *
 * VERSION e APP_SHELL vêm de sw-manifest.js, gerado no build (scripts/build-sw.mjs).
 * Um número de versão mantido à mão é esquecido justamente no deploy em que importa —
 * e o sintoma é o app velho continuar sendo servido para sempre.
 */
importScripts('/sw-manifest.js');

const VERSION = self.__SW_VERSION || 'dev';
const STATIC_CACHE = `bdc-static-${VERSION}`;
const RUNTIME_CACHE = `bdc-runtime-${VERSION}`;

const APP_SHELL = self.__APP_SHELL || ['/', '/offline'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // allSettled: uma URL ausente não derruba toda a instalação.
      await Promise.allSettled(APP_SHELL.map((url) => cache.add(url)));
      // Sem `skipWaiting()` aqui: trocar de versão no meio de uma diária recarregaria a
      // tela sob os dedos de quem está preenchendo. Quem decide é o usuário, pelo aviso
      // de atualização — que manda a mensagem SKIP_WAITING lá embaixo.
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // `/api/**` NUNCA entra em cache. Uma resposta de sync servida do cache é dado
  // corrompido em silêncio: o cliente aplicaria mudanças velhas e avançaria o cursor.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirstNavigation(request) {
  const runtime = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    runtime.put(request, response.clone());
    return response;
  } catch {
    const cached =
      (await runtime.match(request)) ||
      (await caches.match(request, { ignoreSearch: true })) ||
      (await caches.match('/')) ||
      (await caches.match('/offline'));
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);
  return cached || (await network) || Response.error();
}

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
