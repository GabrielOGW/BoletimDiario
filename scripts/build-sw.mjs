/**
 * Gera `public/sw-manifest.js` — a parte do Service Worker que **não** pode ser escrita à
 * mão.
 *
 * `VERSION` era `'v1'` fixo no `sw.js`. Um número manual é esquecido exatamente no deploy
 * em que importa, e o efeito é servir app velho para sempre: o SW só troca de cache
 * quando o nome do cache muda. Gerar no build elimina a classe inteira de erro (ADR-026).
 *
 * O `sw.js` continua escrito à mão, como manda offline-first.md §7 — o que entra aqui é
 * só o que o build sabe e o autor não.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Rotas navegáveis que valem precache. Chunks ficam com o stale-while-revalidate.
 *
 * As três URLs antigas (`/novo`, `/editar`, `/visualizar`) continuam na lista mesmo depois
 * da mudança para `/legado`: elas estão no histórico e nos favoritos de quem já usa o app,
 * e um `rewrite` as mantém navegáveis. Tirá-las daqui seria fazer o app parar de abrir
 * offline justamente no atalho que a pessoa criou.
 */
const APP_SHELL = [
  '/',
  '/legado',
  '/legado/novo',
  '/legado/editar',
  '/legado/visualizar',
  '/novo',
  '/editar',
  '/visualizar',
  '/offline',
  '/login',
  '/producoes',
  // Fase 11: o atalho "Última diária" do ícone do app resolve o destino no próprio
  // aparelho. Se a casca dele não estivesse no cache, o atalho que existe para funcionar
  // sem rede seria o único que exigiria rede.
  '/continuar',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

const version = `v${Date.now().toString(36)}`;

const conteudo = `/* Gerado por scripts/build-sw.mjs — não edite à mão. */
self.__SW_VERSION = ${JSON.stringify(version)};
self.__APP_SHELL = ${JSON.stringify(APP_SHELL, null, 2)};
`;

writeFileSync(resolve(process.cwd(), 'public/sw-manifest.js'), conteudo, 'utf8');
console.log(`sw-manifest.js gerado (${version}, ${APP_SHELL.length} URLs).`);
