import type { Metadata } from 'next';

import { AppHeader } from '@/components/layout/AppHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { roleAtLeast } from '@/domain/platform/enums';
import { requireMember } from '@/lib/auth/guards';
import { listEquipment } from '@/lib/db/queries/equipment';
import { EquipmentList } from '@/features/production/EquipmentList';

export const metadata: Metadata = { title: 'Equipamentos' };

/**
 * O catálogo de equipamento da produção — **fora da fronteira offline** (ADR-016).
 *
 * Server Component lendo Drizzle, como todas as telas de sala. Montar o catálogo é
 * preparação, feita com sinal; o que a diária consome dele chega às telas de módulo como
 * props resolvidas aqui no servidor.
 */
export default async function EquipamentosPage({
  params,
}: {
  params: Promise<{ productionId: string }>;
}) {
  const { productionId } = await params;

  const membership = await requireMember(productionId);
  const equipamentos = await listEquipment(productionId);

  return (
    <>
      <AppHeader
        title="Equipamentos"
        subtitle="O que a produção tem, e quem usa em cada diária"
        backHref={`/p/${productionId}`}
      />

      <PageContainer className="flex flex-col gap-4 py-4 pb-8">
        <EquipmentList
          productionId={productionId}
          equipamentos={equipamentos}
          // Equipamento é dado compartilhado: qualquer MEMBER+ escreve (permissions.md §3).
          canManage={roleAtLeast(membership.role, 'MEMBER')}
        />
      </PageContainer>
    </>
  );
}
