/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * As URLs antigas do boletim continuam funcionando, agora servidas por `/legado`.
   *
   * **Rewrite e não redirect**, de propósito: `/novo`, `/editar` e `/visualizar` estão no
   * precache do Service Worker e nos favoritos de quem já usa o app. Uma resposta com a
   * marca de redirecionamento guardada em cache e devolvida depois para uma navegação é
   * recusada pelo navegador — o sintoma seria o app parar de abrir offline exatamente em
   * quem mais depende dele. O rewrite é invisível: a URL não muda e a resposta é comum.
   */
  async rewrites() {
    return [
      { source: '/novo', destination: '/legado/novo' },
      { source: '/editar', destination: '/legado/editar' },
      { source: '/visualizar', destination: '/legado/visualizar' },
    ];
  },

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
