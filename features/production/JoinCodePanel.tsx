'use client';

import { useActionState } from 'react';

import { SectionCard } from '@/components/layout/SectionCard';
import { Badge } from '@/components/ui/Badge';
import { ShareIcon } from '@/components/ui/icons';
import { FormError } from '@/features/auth/AuthCard';

import { alternarEntradaAction, rotacionarCodigoAction } from './actions';
import { SubmitButton } from './SubmitButton';

/**
 * O código de convite.
 *
 * Todo membro vê o código — é o que faz alguém conseguir passá-lo para quem chegou
 * atrasado no set sem depender do administrador estar por perto. Só `ADMIN`+ pode
 * trocá-lo ou fechar a sala, e essa decisão é do servidor: aqui só escondemos o botão
 * que não funcionaria.
 */
export function JoinCodePanel({
  productionId,
  joinCode,
  joinEnabled,
  canManage,
}: {
  productionId: string;
  joinCode: string;
  joinEnabled: boolean;
  canManage: boolean;
}) {
  const [rotateState, rotate] = useActionState(rotacionarCodigoAction, {});
  const [toggleState, toggle] = useActionState(alternarEntradaAction, {});

  return (
    <SectionCard title="Código de convite" icon={<ShareIcon size={18} />}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="select-all font-mono text-2xl font-semibold tracking-widest text-brand">
          {joinCode}
        </span>
        <Badge tone={joinEnabled ? 'approved' : 'muted'}>
          {joinEnabled ? 'Sala aberta' : 'Sala fechada'}
        </Badge>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-zinc-500">
        Quem entra por código entra como membro, no departamento que escolher.
      </p>

      {canManage ? (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <form action={rotate}>
              <input type="hidden" name="productionId" value={productionId} />
              <SubmitButton size="sm" pendingLabel="Gerando…">
                Gerar novo código
              </SubmitButton>
            </form>

            <form action={toggle}>
              <input type="hidden" name="productionId" value={productionId} />
              <input type="hidden" name="enabled" value={String(!joinEnabled)} />
              <SubmitButton size="sm" pendingLabel="Salvando…">
                {joinEnabled ? 'Fechar a sala' : 'Reabrir a sala'}
              </SubmitButton>
            </form>
          </div>

          <p className="text-xs text-zinc-500">
            Gerar um novo código invalida o anterior na hora. Fechar a sala mantém o
            código e recusa novas entradas.
          </p>

          <FormError>{rotateState.error ?? toggleState.error}</FormError>
        </div>
      ) : null}
    </SectionCard>
  );
}
