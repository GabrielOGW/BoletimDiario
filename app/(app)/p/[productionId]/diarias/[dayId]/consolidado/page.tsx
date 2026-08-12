import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AppHeader } from '@/components/layout/AppHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { requireMember } from '@/lib/auth/guards';
import { uuidSchema } from '@/lib/contracts';
import { getProduction } from '@/lib/db/queries/productions';
import { getShootingDay } from '@/lib/db/queries/shooting-days';
import { ConsolidadoDiaria } from '@/features/diaria/ConsolidadoDiaria';
import { SyncIndicator } from '@/features/sync/SyncIndicator';
import { formatDiaria } from '@/features/production/labels';

export const metadata: Metadata = { title: 'Diária consolidada' };

/**
 * A diária inteira, os três departamentos lado a lado — **dentro da fronteira offline**.
 *
 * Somente leitura, e por isso não pede nada de novo ao servidor: tudo que ela mostra já
 * está fixado no banco local pela mesma fixação que os módulos fazem. Aberta uma vez com
 * rede, funciona em modo avião como o resto da superfície de diária.
 *
 * Não há guarda por departamento: **leitura é livre para todo membro, sempre** — é a razão
 * de a plataforma existir (permissions.md §3).
 */
export default async function ConsolidadoPage({
  params,
}: {
  params: Promise<{ productionId: string; dayId: string }>;
}) {
  const { productionId, dayId } = await params;
  if (!uuidSchema.safeParse(dayId).success) notFound();

  await requireMember(productionId);
  const [producao, diaria] = await Promise.all([
    getProduction(productionId),
    getShootingDay({ productionId, dayId }),
  ]);

  if (!producao || !diaria) notFound();

  return (
    <>
      <AppHeader
        title="Diária consolidada"
        subtitle={`${producao.name} · ${diaria.dayNumber ? `Diária ${diaria.dayNumber} · ` : ''}${formatDiaria(diaria.date)}`}
        backHref={`/p/${productionId}/diarias/${dayId}`}
        right={<SyncIndicator />}
      />

      <PageContainer className="flex flex-col gap-4 py-4 pb-8">
        <ConsolidadoDiaria productionId={productionId} shootingDayId={dayId} />
      </PageContainer>
    </>
  );
}
