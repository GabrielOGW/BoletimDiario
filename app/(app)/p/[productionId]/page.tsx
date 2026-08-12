import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AppHeader } from '@/components/layout/AppHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { SectionCard } from '@/components/layout/SectionCard';
import { Badge } from '@/components/ui/Badge';
import { CalendarIcon, PackageIcon, UsersIcon } from '@/components/ui/icons';
import { roleAtLeast } from '@/domain/platform/enums';
import { requireMember } from '@/lib/auth/guards';
import { listEquipment } from '@/lib/db/queries/equipment';
import { listMembers } from '@/lib/db/queries/members';
import { getProduction } from '@/lib/db/queries/productions';
import { listShootingDays } from '@/lib/db/queries/shooting-days';
import { JoinCodePanel } from '@/features/production/JoinCodePanel';
import {
  DEPARTMENT_LABEL,
  ROLE_LABEL,
  descreveEquipamento,
  formatDiaria,
} from '@/features/production/labels';

export const metadata: Metadata = { title: 'Sala' };

/**
 * Painel da sala — **somente leitura** (ADR-024 / production-room.md §3).
 *
 * A edição acontece dentro do módulo de cada departamento. Isso evita a pior classe de
 * erro possível: alguém alterar o dado de outro departamento por engano de toque.
 */
export default async function SalaPage({
  params,
}: {
  params: Promise<{ productionId: string }>;
}) {
  const { productionId } = await params;

  const membership = await requireMember(productionId);
  const producao = await getProduction(productionId);
  if (!producao) notFound();

  const [diarias, membros, equipamentos] = await Promise.all([
    listShootingDays(productionId),
    listMembers(productionId),
    listEquipment(productionId),
  ]);

  const proxima = diarias[0];
  const canManage = roleAtLeast(membership.role, 'ADMIN');

  return (
    <>
      <AppHeader
        title={producao.name}
        subtitle={producao.company ?? 'Sala da produção'}
        backHref="/producoes"
        right={<Badge tone="brand">{ROLE_LABEL[membership.role]}</Badge>}
      />

      <PageContainer className="flex flex-col gap-4 py-4 pb-8">
        <SectionCard
          title="Diária mais recente"
          icon={<CalendarIcon size={18} />}
          action={
            <Link
              href={`/p/${productionId}/diarias`}
              className="text-xs font-medium text-brand underline underline-offset-2"
            >
              Ver todas
            </Link>
          }
        >
          {proxima ? (
            <div className="flex flex-col gap-1">
              <p className="text-base font-semibold text-zinc-100">
                {proxima.dayNumber ? `Diária ${proxima.dayNumber} · ` : ''}
                {formatDiaria(proxima.date)}
              </p>
              <p className="text-sm text-zinc-400">
                {[proxima.unit, proxima.location].filter(Boolean).join(' · ') ||
                  'Sem locação registrada'}
              </p>
              <p className="text-xs text-zinc-500">
                {proxima.callTime ? `Call ${proxima.callTime.slice(0, 5)}` : 'Sem call'}
                {proxima.wrapTime ? ` · Wrap ${proxima.wrapTime.slice(0, 5)}` : ''}
              </p>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              Nenhuma diária criada.{' '}
              {canManage
                ? 'Crie a primeira em Diárias.'
                : 'Um administrador precisa criar a primeira.'}
            </p>
          )}
        </SectionCard>

        <JoinCodePanel
          productionId={productionId}
          joinCode={producao.joinCode}
          joinEnabled={producao.joinEnabled}
          canManage={canManage}
        />

        <SectionCard
          title={`Equipe · ${membros.length}`}
          icon={<UsersIcon size={18} />}
          action={
            <Link
              href={`/p/${productionId}/membros`}
              className="text-xs font-medium text-brand underline underline-offset-2"
            >
              Gerenciar
            </Link>
          }
        >
          <ul className="flex flex-col gap-2">
            {membros.map((membro) => (
              <li key={membro.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-[15px] text-zinc-100">
                  {membro.name}
                  {membro.jobTitle ? (
                    <span className="text-zinc-500"> · {membro.jobTitle}</span>
                  ) : null}
                </span>
                <Badge>{DEPARTMENT_LABEL[membro.department]}</Badge>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title={`Kit · ${equipamentos.length}`}
          icon={<PackageIcon size={18} />}
          action={
            <Link
              href={`/p/${productionId}/equipamentos`}
              className="text-xs font-medium text-brand underline underline-offset-2"
            >
              Gerenciar
            </Link>
          }
        >
          {equipamentos.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Nenhum equipamento cadastrado. O catálogo é preenchido uma vez e alocado por
              diária — é dele que sai o modelo impresso no cabeçalho dos boletins.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {equipamentos.slice(0, 6).map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-[15px] text-zinc-100">
                    {descreveEquipamento(item)}
                  </span>
                  <Badge>{DEPARTMENT_LABEL[item.department]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <p className="px-1 text-xs leading-relaxed text-zinc-600">
          Câmera, Som e Continuidade anotam a diária nos módulos; a sala é a fonte
          compartilhada — produção, equipe, horários e kit — e nada dela precisa de
          sincronização para existir.
        </p>
      </PageContainer>
    </>
  );
}
