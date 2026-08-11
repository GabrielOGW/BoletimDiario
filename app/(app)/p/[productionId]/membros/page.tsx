import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AppHeader } from '@/components/layout/AppHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { requireMember } from '@/lib/auth/guards';
import { listMembers } from '@/lib/db/queries/members';
import { getProduction } from '@/lib/db/queries/productions';
import { MembersList } from '@/features/production/MembersList';

export const metadata: Metadata = { title: 'Equipe' };

export default async function MembrosPage({
  params,
}: {
  params: Promise<{ productionId: string }>;
}) {
  const { productionId } = await params;

  const membership = await requireMember(productionId);
  const producao = await getProduction(productionId);
  if (!producao) notFound();

  const membros = await listMembers(productionId);

  return (
    <>
      <AppHeader
        title="Equipe"
        subtitle={producao.name}
        backHref={`/p/${productionId}`}
      />

      <PageContainer className="flex flex-col gap-4 py-4 pb-8">
        <MembersList
          productionId={productionId}
          members={membros}
          viewer={{ memberId: membership.id, role: membership.role }}
        />
      </PageContainer>
    </>
  );
}
