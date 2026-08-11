import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AppHeader } from '@/components/layout/AppHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { SectionCard } from '@/components/layout/SectionCard';
import { CalendarIcon, ClapperboardIcon } from '@/components/ui/icons';
import { roleAtLeast } from '@/domain/platform/enums';
import { requireMember } from '@/lib/auth/guards';
import { uuidSchema } from '@/lib/contracts';
import { getShootingDay } from '@/lib/db/queries/shooting-days';
import { DiariaForm } from '@/features/production/DiariaForm';
import { formatDiaria } from '@/features/production/labels';

export const metadata: Metadata = { title: 'Diária' };

export default async function DiariaPage({
  params,
}: {
  params: Promise<{ productionId: string; dayId: string }>;
}) {
  const { productionId, dayId } = await params;
  if (!uuidSchema.safeParse(dayId).success) notFound();

  const membership = await requireMember(productionId);
  const diaria = await getShootingDay({ productionId, dayId });
  if (!diaria) notFound();

  const canManage = roleAtLeast(membership.role, 'ADMIN');
  const titulo = diaria.dayNumber
    ? `Diária ${diaria.dayNumber}`
    : formatDiaria(diaria.date);

  return (
    <>
      <AppHeader
        title={titulo}
        subtitle={formatDiaria(diaria.date)}
        backHref={`/p/${productionId}/diarias`}
      />

      <PageContainer className="flex flex-col gap-4 py-4 pb-8">
        <Link
          href={`/p/${productionId}/diarias/${dayId}/camera`}
          className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-brand/30 bg-brand-soft px-4 py-3 transition hover:brightness-110"
        >
          <ClapperboardIcon size={20} className="text-brand" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-zinc-100">
              Boletim de Câmera
            </span>
            <span className="block text-xs text-zinc-400">
              Cena · Bloco · Plano · Take — funciona sem rede depois de aberto uma vez
            </span>
          </span>
        </Link>

        {/*
          A superfície mínima da Fase 4 continua acessível enquanto Som e Continuidade não
          têm módulo: para eles é a única porta. Rótulo modesto de propósito — ela não é o
          boletim de ninguém (ADR-030).
        */}
        <Link
          href={`/p/${productionId}/diarias/${dayId}/takes`}
          className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition hover:bg-surface-hover"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-zinc-300">
              Base compartilhada · Cena · Setup · Take
            </span>
            <span className="block text-xs text-zinc-500">
              Enquanto Som e Continuidade não têm módulo próprio
            </span>
          </span>
        </Link>

        {canManage ? (
          <DiariaForm productionId={productionId} diaria={diaria} />
        ) : (
          <ResumoDaDiaria diaria={diaria} />
        )}
      </PageContainer>
    </>
  );
}

/** Quem não pode editar vê o mesmo conteúdo, sem formulário — não uma tela a menos. */
function ResumoDaDiaria({
  diaria,
}: {
  diaria: NonNullable<Awaited<ReturnType<typeof getShootingDay>>>;
}) {
  const linhas: [string, string | null][] = [
    ['Data', formatDiaria(diaria.date)],
    ['Unidade', diaria.unit],
    ['Locação', diaria.location],
    ['Call', diaria.callTime?.slice(0, 5) ?? null],
    ['Wrap', diaria.wrapTime?.slice(0, 5) ?? null],
    [
      'Almoço',
      diaria.lunchStart
        ? `${diaria.lunchStart.slice(0, 5)}–${diaria.lunchEnd?.slice(0, 5) ?? ''}`
        : null,
    ],
  ];

  return (
    <>
      <SectionCard title="A diária" icon={<CalendarIcon size={18} />}>
        <dl className="flex flex-col gap-2 text-sm">
          {linhas.map(([rotulo, valor]) => (
            <div key={rotulo} className="flex justify-between gap-3">
              <dt className="text-zinc-500">{rotulo}</dt>
              <dd className="text-right text-zinc-200">{valor ?? '—'}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>

      {diaria.notes ? (
        <SectionCard title="Observações">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
            {diaria.notes}
          </p>
        </SectionCard>
      ) : null}
    </>
  );
}
