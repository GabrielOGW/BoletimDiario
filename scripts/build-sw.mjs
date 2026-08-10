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

/** Rotas navegáveis que valem precache. Chunks ficam com o stale-while-revalidate. */
const APP_SHELL = [
  '/',
  '/novo',
  '/editar',
  '/visualizar',
  '/offline',
  '/login',
  '/producoes',
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
