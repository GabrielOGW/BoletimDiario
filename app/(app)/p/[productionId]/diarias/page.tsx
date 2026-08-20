import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AppHeader } from '@/components/layout/AppHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { CalendarIcon, PlusIcon } from '@/components/ui/icons';
import { roleAtLeast } from '@/domain/platform/enums';
import { requireMember } from '@/lib/auth/guards';
import { getProduction } from '@/lib/db/queries/productions';
import { listShootingDays } from '@/lib/db/queries/shooting-days';
import { formatDiaria } from '@/features/production/labels';

export const metadata: Metadata = { title: 'Diárias' };

export default async function DiariasPage({
  params,
}: {
  params: Promise<{ productionId: string }>;
}) {
  const { productionId } = await params;

  const membership = await requireMember(productionId);
  const producao = await getProduction(productionId);
  if (!producao) notFound();

  const diarias = await listShootingDays(productionId);
  // Criar diária é `ADMIN`+ (permissions.md §1). O servidor recusa de qualquer forma;
  // esconder o botão só evita oferecer um caminho que terminaria em erro.
  const canManage = roleAtLeast(membership.role, 'ADMIN');

  return (
    <>
      <AppHeader
        title="Diárias"
        subtitle={producao.name}
        backHref={`/p/${productionId}`}
        right={
          canManage ? (
            <Link href={`/p/${productionId}/diarias/nova`}>
              <Button size="sm" variant="primary" leftIcon={<PlusIcon size={16} />}>
                Nova
              </Button>
            </Link>
          ) : null
        }
      />

      <PageContainer as="main" className="flex flex-col gap-3 py-4 pb-8">
        {diarias.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon size={40} />}
            title="Nenhuma diária ainda"
            description={
              canManage
                ? 'Crie a diária de hoje para a equipe começar a preencher.'
                : 'Um administrador precisa criar a primeira diária.'
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {diarias.map((diaria) => (
              <li key={diaria.id}>
                <Link
                  href={`/p/${productionId}/diarias/${diaria.id}`}
                  className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition hover:bg-surface-hover"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-zinc-100">
                      {diaria.dayNumber ? `Diária ${diaria.dayNumber} · ` : ''}
                      {formatDiaria(diaria.date)}
                    </p>
                    <p className="truncate text-xs text-zinc-400">
                      {[diaria.unit, diaria.location].filter(Boolean).join(' · ') ||
                        'Sem locação'}
                    </p>
                  </div>
                  {diaria.callTime ? (
                    <span className="shrink-0 font-mono text-sm text-zinc-400">
                      {diaria.callTime.slice(0, 5)}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PageContainer>
    </>
  );
}
