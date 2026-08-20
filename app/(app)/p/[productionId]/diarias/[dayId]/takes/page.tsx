import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AppHeader } from '@/components/layout/AppHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { hasActiveDepartment, roleAtLeast } from '@/domain/platform/enums';
import { requireMember } from '@/lib/auth/guards';
import { uuidSchema } from '@/lib/contracts';
import { getShootingDay } from '@/lib/db/queries/shooting-days';
import { DiariaSurface } from '@/features/diaria/DiariaSurface';
import { SyncIndicator } from '@/features/sync/SyncIndicator';
import { formatDiaria } from '@/features/production/labels';

export const metadata: Metadata = { title: 'Takes' };

/**
 * A superfície de diária — **dentro da fronteira offline** (ADR-016).
 *
 * O servidor faz aqui exatamente duas coisas, e as duas antes de a tela existir: checar
 * o pertencimento e dizer de que dia se trata. Tudo o que acontece depois vem do banco
 * local; se esta página começar a buscar take no servidor, a fronteira foi rompida.
 *
 * A leitura da diária no servidor é só para o cabeçalho e para o 404 — a tela abre sem
 * rede depois de fixada, porque o `DiariaSurface` lê do Dexie.
 */
export default async function TakesPage({
  params,
}: {
  params: Promise<{ productionId: string; dayId: string }>;
}) {
  const { productionId, dayId } = await params;
  if (!uuidSchema.safeParse(dayId).success) notFound();

  const membership = await requireMember(productionId);
  const diaria = await getShootingDay({ productionId, dayId });
  if (!diaria) notFound();

  return (
    <>
      <AppHeader
        title={
          diaria.dayNumber ? `Diária ${diaria.dayNumber}` : formatDiaria(diaria.date)
        }
        subtitle={[formatDiaria(diaria.date), diaria.location]
          .filter(Boolean)
          .join(' · ')}
        backHref={`/p/${productionId}/diarias/${dayId}`}
        right={<SyncIndicator />}
      />

      <PageContainer as="main" className="flex flex-col gap-4 py-4 pb-8">
        <DiariaSurface
          productionId={productionId}
          shootingDayId={dayId}
          canEdit={roleAtLeast(membership.role, 'MEMBER')}
          podeAnotar={hasActiveDepartment(membership.departments)}
        />
      </PageContainer>
    </>
  );
}
