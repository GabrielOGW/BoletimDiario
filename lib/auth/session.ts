/**
 * Leitura de sessão no servidor.
 *
 * A sessão vive no banco, não num JWT — é o que torna possível revogar o acesso de um
 * dispositivo perdido em set sem esperar um token expirar.
 */

import 'server-only';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { auth } from './config';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

/**
 * `cache` do React: várias chamadas na mesma renderização viram uma consulta só.
 * Sem isso, um layout, uma página e três componentes consultariam a sessão cinco vezes.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
  };
});

/**
 * Exige sessão válida. Redireciona para o login preservando o destino — quem abriu um
 * link direto para a diária volta para a diária, não para a home.
 */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (user) return user;

  const target = returnTo ? `?voltarPara=${encodeURIComponent(returnTo)}` : '';
  redirect(`/login${target}`);
}
