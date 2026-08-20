import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppHeader } from '@/components/layout/AppHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { EmptyState } from '@/components/ui/EmptyState';
import { CalendarIcon } from '@/components/ui/icons';
import { requireUser } from '@/lib/auth/session';
import { diariasNaData } from '@/lib/db/queries/atalho';
import { caminhoDoAtalho, rotaDoDepartamento } from '@/lib/atalhos';
import { ContinuarDiaria } from '@/features/diaria/ContinuarDiaria';
import { HojeRedirect } from '@/features/production/HojeRedirect';
import { DEPARTMENT_LABEL, formatDiaria } from '@/features/production/labels';

export const metadata: Metadata = { title: 'Diária de hoje' };

/**
 * "Diária de hoje" — o destino padrão do caminho curto (Fase 11).
 *
 * Havendo **uma** diária hoje, esta rota nem é uma tela: ela redireciona direto para a
 * anotação, no módulo do departamento da pessoa. Do ícone do app até marcar um take, um
 * toque.
 *
 * Ela **exige rede**, e isso é escolha: é a primeira porta do dia, quando ainda se está
 * saindo de casa ou chegando na locação. O caminho que precisa funcionar sem sinal é o
 * "continuar de onde parei", que é local — e que aparece aqui embaixo justamente para
 * quando esta consulta não encontra nada.
 *
 * A data vem do aparelho (`?d=`), não do banco: ver `HojeRedirect` e R9.
 */
export default async function HojePage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { d } = await searchParams;
  const user = await requireUser();

  // Sem a data do aparelho não há pergunta a fazer — o cliente devolve a rota com ela.
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return (
      <>
        <AppHeader title="Diária de hoje" backHref="/producoes" />
        <PageContainer className="py-4">
          <HojeRedirect />
        </PageContainer>
      </>
    );
  }

  const diarias = await diariasNaData({ userId: user.id, date: d });

  // Uma só: o app não pergunta o que já sabe.
  if (diarias.length === 1) {
    const diaria = diarias[0];
    redirect(
      caminhoDoAtalho({
        productionId: diaria.productionId,
        shootingDayId: diaria.shootingDayId,
        modulo: rotaDoDepartamento(diaria.department),
      }),
    );
  }

  return (
    <>
      <AppHeader
        title="Diária de hoje"
        subtitle={formatDiaria(d)}
        backHref="/producoes"
      />

      <PageContainer className="flex flex-col gap-4 py-4 pb-8">
        {diarias.length === 0 ? (
          <>
            <EmptyState
              icon={<CalendarIcon size={40} />}
              title="Nenhuma diária marcada para hoje"
              description="Quando a produção criar a diária de hoje, este atalho abre direto na sua anotação."
            />
            {/* O outro caminho: o último lugar onde esta pessoa esteve. Funciona sem rede
                e é exatamente o que salva o dia em que a diária foi criada com outra data. */}
            <ContinuarDiaria />
            <Link
              href="/producoes"
              className="text-center text-sm font-medium text-brand underline underline-offset-2"
            >
              Ver minhas produções
            </Link>
          </>
        ) : (
          <>
            {/* Duas produções rodando no mesmo dia é raro, mas acontece — e escolher
                errado por conta do app é pior do que escolher na mão. */}
            <p className="px-1 text-sm text-zinc-500">
              Você tem diária em {diarias.length} produções hoje.
            </p>
            <ul className="flex flex-col gap-2">
              {diarias.map((diaria) => (
                <li key={diaria.shootingDayId}>
                  <Link
                    href={caminhoDoAtalho({
                      productionId: diaria.productionId,
                      shootingDayId: diaria.shootingDayId,
                      modulo: rotaDoDepartamento(diaria.department),
                    })}
                    className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition hover:bg-surface-hover"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-zinc-100">
                        {diaria.producao}
                      </span>
                      <span className="block truncate text-xs text-zinc-500">
                        {diaria.dayNumber ? `Diária ${diaria.dayNumber} · ` : ''}
                        {DEPARTMENT_LABEL[diaria.department]}
                        {diaria.location ? ` · ${diaria.location}` : ''}
                      </span>
                    </span>
                    <span aria-hidden className="text-brand">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </PageContainer>
    </>
  );
}
