import type { Metadata } from 'next';
import Link from 'next/link';

import { AppHeader } from '@/components/layout/AppHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { UsersIcon } from '@/components/ui/icons';
import { getSessionUser } from '@/lib/auth/session';
import { ImportarBoletins } from '@/features/legado/ImportarBoletins';

export const metadata: Metadata = { title: 'Importar boletins' };

/**
 * Levar os boletins deste aparelho para a plataforma.
 *
 * A tela pede sessão, mas **não** redireciona sozinha: quem chega aqui veio dos próprios
 * boletins, e ser jogado numa tela de login sem explicação é a diferença entre "preciso
 * entrar" e "perdi meus boletins". A ação em si exige sessão de verdade, no servidor.
 */
export default async function ImportarPage() {
  const user = await getSessionUser();

  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      <AppHeader
        title="Importar para a plataforma"
        subtitle="Boletins deste aparelho"
        backHref="/legado"
      />

      <main className="flex-1 py-4">
        <PageContainer className="space-y-4">
          {user ? (
            <ImportarBoletins />
          ) : (
            <EmptyState
              icon={<UsersIcon size={40} />}
              title="Entre para importar"
              description="A importação cria uma produção sincronizada, e produção pertence a uma conta. Seus boletins continuam neste aparelho de qualquer forma."
              action={
                <Link href="/login?voltarPara=%2Flegado%2Fimportar">
                  <Button variant="primary">Entrar</Button>
                </Link>
              }
            />
          )}
        </PageContainer>
      </main>
    </div>
  );
}
