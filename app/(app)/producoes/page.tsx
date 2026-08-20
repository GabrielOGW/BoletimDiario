import type { Metadata } from 'next';
import Link from 'next/link';

import { AppHeader } from '@/components/layout/AppHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { CalendarIcon, ClapperboardIcon } from '@/components/ui/icons';
import { requireUser } from '@/lib/auth/session';
import { listProductionsForUser } from '@/lib/db/queries/productions';
import { SignOutButton } from '@/features/auth/SignOutButton';
import { ContinuarDiaria } from '@/features/diaria/ContinuarDiaria';
import { DEPARTMENT_LABEL, ROLE_LABEL } from '@/features/production/labels';
import { ProductionsForms } from '@/features/production/ProductionsForms';

export const metadata: Metadata = { title: 'Minhas produções' };

export default async function ProducoesPage() {
  const user = await requireUser();
  const producoes = await listProductionsForUser(user.id);

  return (
    <>
      <AppHeader
        title="Minhas produções"
        subtitle={user.name}
        right={
          <>
            {/* A conta mora aqui e não numa aba própria: entrar nela é raro, e uma aba
                permanente custaria espaço na barra de quem só quer chegar na diária. */}
            <Link
              href="/conta"
              className="flex h-11 items-center rounded-xl px-3 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white"
            >
              Conta
            </Link>
            <SignOutButton />
          </>
        }
      />

      <PageContainer as="main" className="flex flex-col gap-4 py-4 pb-16">
        {/* Os dois caminhos curtos (Fase 11), antes da lista: "continuar" é local e
            aparece só quando há para onde voltar; "hoje" pergunta ao servidor e resolve
            no destino. A lista continua aqui embaixo, inteira — atalho que esconde o
            caminho longo vira armadilha no dia em que ele é o certo. */}
        {producoes.length > 0 ? (
          <>
            <ContinuarDiaria />
            <Link
              href="/hoje"
              className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition hover:bg-surface-hover"
            >
              <CalendarIcon size={20} className="shrink-0 text-brand" />
              <span className="min-w-0 flex-1 text-sm font-medium text-zinc-100">
                Diária de hoje
              </span>
              <span aria-hidden className="text-zinc-400">
                →
              </span>
            </Link>
          </>
        ) : null}

        {producoes.length === 0 ? (
          <EmptyState
            icon={<ClapperboardIcon size={40} />}
            title="Nenhuma produção ainda"
            description="Crie uma sala ou entre com o código que a equipe te passou."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {producoes.map((producao) => (
              <li key={producao.id}>
                <Link
                  href={`/p/${producao.id}`}
                  className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition hover:bg-surface-hover"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-zinc-100">
                      {producao.name}
                    </p>
                    <p className="truncate text-xs text-zinc-400">
                      {producao.company ?? 'Sem produtora'} ·{' '}
                      {DEPARTMENT_LABEL[producao.department]}
                    </p>
                  </div>
                  <Badge tone={producao.role === 'MEMBER' ? 'neutral' : 'brand'}>
                    {ROLE_LABEL[producao.role]}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <ProductionsForms />

        <p className="mt-2 text-center text-xs leading-relaxed text-zinc-400">
          O boletim de câmera local continua funcionando sem conta em{' '}
          <Link href="/legado" className="text-zinc-400 underline underline-offset-2">
            boletins locais
          </Link>
          .
        </p>
      </PageContainer>
    </>
  );
}
