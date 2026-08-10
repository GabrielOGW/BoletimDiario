/**
 * Cliente de autenticação (browser).
 *
 * Só cuida de sessão. **Nada aqui decide autorização** — quem decide é
 * `lib/auth/guards.ts`, no servidor.
 */

'use client';

import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient();

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  requestPasswordReset,
  resetPassword,
} = authClient;
