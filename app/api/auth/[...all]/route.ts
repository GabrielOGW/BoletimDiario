/**
 * Handler da Better Auth. Todos os endpoints de sessão vivem aqui.
 *
 * O Service Worker **nunca** pode cachear `/api/**` — resposta de autenticação em cache
 * é sessão fantasma.
 */

import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@/lib/auth/config';

export const { GET, POST } = toNextJsHandler(auth);
