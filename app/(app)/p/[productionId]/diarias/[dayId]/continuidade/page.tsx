import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AppHeader } from '@/components/layout/AppHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { SectionCard } from '@/components/layout/SectionCard';
import { ClockIcon, InfoIcon, UsersIcon } from '@/components/ui/icons';
import { hasActiveDepartment, roleAtLeast } from '@/domain/platform/enums';
import { requireMember } from '@/lib/auth/guards';
import { uuidSchema } from '@/lib/contracts';
import { listMembers } from '@/lib/db/queries/members';
import { getProduction } from '@/lib/db/queries/productions';
import { getShootingDay } from '@/lib/db/queries/shooting-days';
import { ContinuidadeDiaria } from '@/features/continuity/ContinuidadeDiaria';
import { SyncIndicator } from '@/features/sync/SyncIndicator';
import { DEPARTMENT_LABEL, formatDiaria } from '@/features/production/labels';

export const metadata: Metadata = { title: 'Boletim de Continuidade' };

/**
 * O Boletim de Continuidade na plataforma — dentro da fronteira offline.
 *
 * Mesma divisão de trabalho da rota de Câmera: o servidor checa pertencimento e resolve o
 * cabeçalho (produção, horários, equipe), que é dado de sala; cena, plano e take vêm do
 * banco local, e nenhuma escrita daqui espera rede (ADR-016).
 */
export default async function ContinuidadePage({
  params,
}: {
  params: Promise<{ productionId: string; dayId: string }>;
}) {
  const { productionId, dayId } = await params;
  if (!uuidSchema.safeParse(dayId).success) notFound();

  const membership = await requireMember(productionId);
  const [producao, diaria, membros] = await Promise.all([
    getProduction(productionId),
    getShootingDay({ productionId, dayId }),
    listMembers(productionId),
  ]);

  if (!producao || !diaria) notFound();

  const equipeContinuidade = membros.filter(
    (membro) => membro.department === 'CONTINUITY',
  );
  const podeAnotar =
    hasActiveDepartment(membership.departments) &&
    membership.departments.includes('CONTINUITY');

  return (
    <>
      <AppHeader
        title="Boletim de Continuidade"
        subtitle={`${producao.name} · ${diaria.dayNumber ? `Diária ${diaria.dayNumber} · ` : ''}${formatDiaria(diaria.date)}`}
        backHref={`/p/${productionId}/diarias/${dayId}`}
        right={<SyncIndicator />}
      />

      <PageContainer className="flex flex-col gap-4 py-4 pb-8">
        <ContinuidadeDiaria
          productionId={productionId}
          shootingDayId={dayId}
          canEdit={roleAtLeast(membership.role, 'MEMBER') && podeAnotar}
          // Os mesmos dados da sala, em texto puro, para a folha impressa e para o CSV.
          // Vão junto com a página porque o relatório é fechado no fim da diária, quando a
          // locação costuma estar sem sinal — buscá-los na hora seria não entregar.
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
            equipe: equipeContinuidade.map((membro) => ({
              id: membro.id,
              nome: membro.name,
              funcao: membro.jobTitle ?? DEPARTMENT_LABEL[membro.department],
            })),
          }}
          cabecalho={
            <>
              {!podeAnotar ? (
                <p className="rounded-xl border border-brand/30 bg-brand-soft px-3.5 py-3 text-sm leading-relaxed text-zinc-200">
                  Você não está cadastrado no departamento de Continuidade nesta produção,
                  então o boletim abre em modo de leitura. Um administrador pode ajustar
                  isso na tela de equipe.
                </p>
              ) : null}

              <SectionCard title="Produção" icon={<InfoIcon size={18} />}>
                <dl className="flex flex-col gap-1.5 text-sm">
                  <Linha rotulo="Projeto" valor={producao.name} />
                  <Linha rotulo="Produtora" valor={producao.company} />
                  <Linha rotulo="Direção" valor={producao.director} />
                  <Linha rotulo="Data" valor={formatDiaria(diaria.date)} />
                  <Linha rotulo="Diária" valor={diaria.dayNumber} />
                </dl>
              </SectionCard>

              <SectionCard
                title="Horários"
                icon={<ClockIcon size={18} />}
                collapsible
                defaultOpen={false}
                summary={
                  [diaria.callTime?.slice(0, 5), diaria.wrapTime?.slice(0, 5)]
                    .filter(Boolean)
                    .join(' – ') || 'Sem horários'
                }
                action={
                  <Link
                    href={`/p/${productionId}/diarias/${dayId}`}
                    className="text-xs font-medium text-brand underline underline-offset-2"
                  >
                    Editar na sala
                  </Link>
                }
              >
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Linha rotulo="Call" valor={diaria.callTime?.slice(0, 5)} />
                  <Linha rotulo="Wrap" valor={diaria.wrapTime?.slice(0, 5)} />
                  <Linha rotulo="Almoço" valor={diaria.lunchStart?.slice(0, 5)} />
                  <Linha rotulo="Retorno" valor={diaria.lunchEnd?.slice(0, 5)} />
                  <Linha rotulo="Locação" valor={diaria.location} />
                  <Linha rotulo="Unidade" valor={diaria.unit} />
                </dl>
              </SectionCard>

              <SectionCard
                title="Equipe de continuidade"
                icon={<UsersIcon size={18} />}
                collapsible
                defaultOpen={false}
                summary={`${equipeContinuidade.length} pessoa(s)`}
                action={
                  <Link
                    href={`/p/${productionId}/membros`}
                    className="text-xs font-medium text-brand underline underline-offset-2"
                  >
                    Editar na sala
                  </Link>
                }
              >
                {equipeContinuidade.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    Ninguém cadastrado no departamento de Continuidade ainda.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {equipeContinuidade.map((membro) => (
                      <li key={membro.id} className="flex justify-between gap-3">
                        <span className="text-zinc-100">{membro.name}</span>
                        <span className="text-zinc-500">
                          {membro.jobTitle ?? DEPARTMENT_LABEL[membro.department]}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </>
          }
        />
      </PageContainer>
    </>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-zinc-500">{rotulo}</dt>
      <dd className="text-right text-zinc-200">{valor || '—'}</dd>
    </div>
  );
}
