/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Garante que o Service Worker nunca fique preso em cache do navegador.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        /**
         * O manifesto do SW precisa da mesma regra: ele carrega por `importScripts`, e
         * se ficar em cache o SW novo lê a versão antiga — exatamente o problema que
         * gerá-lo no build resolve.
         */
        source: '/sw-manifest.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
      {
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json; charset=utf-8' },
        ],
      },
    ];
  },
};

export default nextConfig;
