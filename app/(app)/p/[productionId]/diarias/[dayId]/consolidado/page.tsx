import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AppHeader } from '@/components/layout/AppHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { requireMember } from '@/lib/auth/guards';
import { uuidSchema } from '@/lib/contracts';
import { listAssignments } from '@/lib/db/queries/equipment';
import { listMembers } from '@/lib/db/queries/members';
import { getProduction } from '@/lib/db/queries/productions';
import { getShootingDay } from '@/lib/db/queries/shooting-days';
import { ConsolidadoDiaria } from '@/features/diaria/ConsolidadoDiaria';
import { SyncIndicator } from '@/features/sync/SyncIndicator';
import {
  DEPARTMENT_LABEL,
  descreveEquipamento,
  formatDiaria,
} from '@/features/production/labels';

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
  searchParams,
}: {
  params: Promise<{ productionId: string; dayId: string }>;
  /** `?q=` — o termo que a busca da produção passou para cá (ADR-036). */
  searchParams: Promise<{ q?: string }>;
}) {
  const { productionId, dayId } = await params;
  const { q } = await searchParams;
  if (!uuidSchema.safeParse(dayId).success) notFound();

  await requireMember(productionId);
  const [producao, diaria, membros, equipamentos] = await Promise.all([
    getProduction(productionId),
    getShootingDay({ productionId, dayId }),
    listMembers(productionId),
    listAssignments({ productionId, shootingDayId: dayId }),
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
        <ConsolidadoDiaria
          productionId={productionId}
          shootingDayId={dayId}
          termoInicial={q ?? ''}
          // O cabeçalho vai junto com a página, como nos três módulos: o relatório é
          // impresso e o arquivo é gerado no fim da diária, quando não há sinal.
          // Aqui a equipe é a **inteira**, não a de um departamento — a folha
          // consolidada é a que a produção recebe.
          impressao={{
            producao: {
              name: producao.name,
              company: producao.company,
              director: producao.director,
              dop: producao.dop,
            },
            diaria: {
              date: diaria.date,
              dayNumber: diaria.dayNumber,
              callTime: diaria.callTime,
              wrapTime: diaria.wrapTime,
              lunchStart: diaria.lunchStart,
              lunchEnd: diaria.lunchEnd,
              location: diaria.location,
              unit: diaria.unit,
              notes: diaria.notes,
            },
            equipamentos: equipamentos.map((linha) => ({
              id: linha.id,
              departamento: linha.department,
              categoria: linha.category,
              descricao: descreveEquipamento(linha),
            })),
            equipe: membros.map((membro) => ({
              id: membro.id,
              nome: membro.name,
              funcao: membro.jobTitle ?? DEPARTMENT_LABEL[membro.department],
            })),
          }}
        />
      </PageContainer>
    </>
  );
}
