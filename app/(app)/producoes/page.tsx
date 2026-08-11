import type { Metadata } from 'next';
import Link from 'next/link';

import { AppHeader } from '@/components/layout/AppHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ClapperboardIcon } from '@/components/ui/icons';
import { requireUser } from '@/lib/auth/session';
import { listProductionsForUser } from '@/lib/db/queries/productions';
import { SignOutButton } from '@/features/auth/SignOutButton';
import { DEPARTMENT_LABEL, ROLE_LABEL } from '@/features/production/labels';
import { ProductionsForms } from '@/features/production/ProductionsForms';

export const metadata: Metadata = { title: 'Minhas produções' };

export default async function ProducoesPage() {
  const user = await requireUser();
  const producoes = await listProductionsForUser(user.id);

  return (
    <>
      <AppHeader
        title="Minhas produções"
        subtitle={user.name}
        right={<SignOutButton />}
      />

      <PageContainer className="flex flex-col gap-4 py-4 pb-16">
        {producoes.length === 0 ? (
          <EmptyState
            icon={<ClapperboardIcon size={40} />}
            title="Nenhuma produção ainda"
            description="Crie uma sala ou entre com o código que a equipe te passou."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {producoes.map((producao) => (
              <li key={producao.id}>
                <Link
                  href={`/p/${producao.id}`}
                  className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition hover:bg-surface-hover"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-zinc-100">
                      {producao.name}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {producao.company ?? 'Sem produtora'} ·{' '}
                      {DEPARTMENT_LABEL[producao.department]}
                    </p>
                  </div>
                  <Badge tone={producao.role === 'MEMBER' ? 'neutral' : 'brand'}>
                    {ROLE_LABEL[producao.role]}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <ProductionsForms />

        <p className="mt-2 text-center text-xs leading-relaxed text-zinc-600">
          O boletim de câmera local continua funcionando sem conta em{' '}
          <Link href="/legado" className="text-zinc-400 underline underline-offset-2">
            boletins locais
          </Link>
          .
        </p>
      </PageContainer>
    </>
  );
}
