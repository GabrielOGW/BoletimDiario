import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getSessionUser } from '@/lib/auth/session';

/**
 * Casca das telas de autenticação.
 *
 * Quem já tem sessão não vê login nem cadastro — vai direto para as produções. Sessão
 * dura 90 dias (ADR-025), então este redirecionamento é o caminho normal de quem só
 * abriu o app, não uma exceção.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (user) redirect('/producoes');

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center">
          <span className="text-lg font-semibold tracking-tight text-zinc-100">
            Boletim Audiovisual
          </span>
          <span className="mt-1 block text-xs uppercase tracking-wide text-zinc-400">
            Câmera · Som · Continuidade
          </span>
        </Link>

        {children}

        <p className="mt-8 text-center text-xs leading-relaxed text-zinc-400">
          Só para a sala colaborativa. O boletim de câmera local continua funcionando{' '}
          <Link href="/legado" className="text-zinc-400 underline underline-offset-2">
            sem conta
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
