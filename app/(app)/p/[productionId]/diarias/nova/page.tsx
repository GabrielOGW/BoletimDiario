import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AppHeader } from '@/components/layout/AppHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { ForbiddenError, requireMember } from '@/lib/auth/guards';
import { getProduction } from '@/lib/db/queries/productions';
import { DiariaForm } from '@/features/production/DiariaForm';

export const metadata: Metadata = { title: 'Nova diária' };

export default async function NovaDiariaPage({
  params,
}: {
  params: Promise<{ productionId: string }>;
}) {
  const { productionId } = await params;

  // Papel checado **antes de renderizar**, não só ao enviar: a tela inteira é
  // privilégio de `ADMIN`+, e mostrá-la para quem não pode salvar seria mentira.
  try {
    await requireMember(productionId, { minRole: 'ADMIN' });
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  const producao = await getProduction(productionId);
  if (!producao) notFound();

  return (
    <>
      <AppHeader
        title="Nova diária"
        subtitle={producao.name}
        backHref={`/p/${productionId}/diarias`}
      />

      <PageContainer className="flex flex-col gap-4 py-4 pb-8">
        <DiariaForm productionId={productionId} />
      </PageContainer>
    </>
  );
}
