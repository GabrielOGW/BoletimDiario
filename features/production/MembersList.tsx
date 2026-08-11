'use client';

import { useActionState, useState } from 'react';

import { SectionCard } from '@/components/layout/SectionCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { UsersIcon } from '@/components/ui/icons';
import type { MemberRole } from '@/domain/platform/enums';
import { roleAtLeast } from '@/domain/platform/enums';
import type { MemberRow } from '@/lib/db/queries/members';
import { FormError } from '@/features/auth/AuthCard';

import {
  removerMembroAction,
  sairDaProducaoAction,
  salvarMembroAction,
  transferirPosseAction,
} from './actions';
import { DEPARTMENT_LABEL, ROLE_HINT, ROLE_LABEL } from './labels';
import { DEPARTMENT_OPTIONS, ROLE_OPTIONS } from './options';
import { SubmitButton } from './SubmitButton';

interface MembersListProps {
  productionId: string;
  members: MemberRow[];
  /** Papel e id de quem está olhando — decide o que aparece, nunca o que é permitido. */
  viewer: { memberId: string; role: MemberRole };
}

export function MembersList({ productionId, members, viewer }: MembersListProps) {
  const canManage = roleAtLeast(viewer.role, 'ADMIN');
  const isOwner = viewer.role === 'OWNER';

  return (
    <div className="flex flex-col gap-4">
      {members.map((member) => (
        <MemberCard
          key={member.id}
          productionId={productionId}
          member={member}
          canManage={canManage && member.role !== 'OWNER'}
          canTransfer={isOwner && member.id !== viewer.memberId}
        />
      ))}

      <LeaveCard productionId={productionId} isOwner={isOwner} />
    </div>
  );
}

function MemberCard({
  productionId,
  member,
  canManage,
  canTransfer,
}: {
  productionId: string;
  member: MemberRow;
  canManage: boolean;
  canTransfer: boolean;
}) {
  const [saveState, save] = useActionState(salvarMembroAction, {});
  const [removeState, remove] = useActionState(removerMembroAction, {});
  const [transferState, transfer] = useActionState(transferirPosseAction, {});
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [confirmingTransfer, setConfirmingTransfer] = useState(false);

  return (
    <SectionCard
      title={member.name}
      icon={<UsersIcon size={18} />}
      collapsible
      defaultOpen={false}
      summary={
        <span className="flex items-center gap-1.5">
          <Badge tone={member.role === 'OWNER' ? 'brand' : 'neutral'}>
            {ROLE_LABEL[member.role]}
          </Badge>
          <Badge tone="muted">{DEPARTMENT_LABEL[member.department]}</Badge>
        </span>
      }
    >
      <p className="mb-4 break-all text-xs text-zinc-500">{member.email}</p>

      {canManage ? (
        <form action={save} className="flex flex-col gap-4">
          <input type="hidden" name="productionId" value={productionId} />
          <input type="hidden" name="memberId" value={member.id} />

          <SelectField
            label="Papel na sala"
            name="role"
            defaultValue={member.role}
            options={ROLE_OPTIONS}
            hint={ROLE_HINT[member.role]}
          />
          <SelectField
            label="Departamento"
            name="department"
            defaultValue={member.department}
            options={DEPARTMENT_OPTIONS}
          />
          <TextField
            label="Função (opcional)"
            name="jobTitle"
            defaultValue={member.jobTitle ?? ''}
            placeholder="1º AC"
          />

          <FormError>{saveState.error}</FormError>

          <SubmitButton variant="primary" pendingLabel="Salvando…">
            Salvar
          </SubmitButton>
        </form>
      ) : (
        <dl className="flex flex-col gap-1 text-sm text-zinc-400">
          <div className="flex gap-2">
            <dt className="text-zinc-500">Papel:</dt>
            <dd>{ROLE_LABEL[member.role]}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-zinc-500">Departamento:</dt>
            <dd>{DEPARTMENT_LABEL[member.department]}</dd>
          </div>
          {member.jobTitle ? (
            <div className="flex gap-2">
              <dt className="text-zinc-500">Função:</dt>
              <dd>{member.jobTitle}</dd>
            </div>
          ) : null}
        </dl>
      )}

      {canTransfer || canManage ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          {canTransfer ? (
            <Button size="sm" onClick={() => setConfirmingTransfer(true)}>
              Transferir posse
            </Button>
          ) : null}
          {canManage ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-red-400"
              onClick={() => setConfirmingRemove(true)}
            >
              Remover da produção
            </Button>
          ) : null}
        </div>
      ) : null}

      <FormError>{removeState.error ?? transferState.error}</FormError>

      {/* Os formulários das ações destrutivas ficam fora do diálogo: o diálogo só decide
          se elas são enviadas, e um `requestSubmit` a partir dele é mais simples que
          reconstruir os campos ocultos lá dentro. */}
      <form action={remove} id={`remover-${member.id}`} className="hidden">
        <input type="hidden" name="productionId" value={productionId} />
        <input type="hidden" name="memberId" value={member.id} />
      </form>
      <form action={transfer} id={`transferir-${member.id}`} className="hidden">
        <input type="hidden" name="productionId" value={productionId} />
        <input type="hidden" name="memberId" value={member.id} />
      </form>

      <ConfirmDialog
        open={confirmingRemove}
        title={`Remover ${member.name}?`}
        description="A pessoa perde o acesso à sala. O que ela já preencheu continua na produção."
        confirmLabel="Remover"
        destructive
        onConfirm={() => {
          setConfirmingRemove(false);
          submitForm(`remover-${member.id}`);
        }}
        onCancel={() => setConfirmingRemove(false)}
      />

      <ConfirmDialog
        open={confirmingTransfer}
        title={`Transferir a posse para ${member.name}?`}
        description="Você passa a ser administrador. Só o novo dono poderá transferir de volta."
        confirmLabel="Transferir"
        onConfirm={() => {
          setConfirmingTransfer(false);
          submitForm(`transferir-${member.id}`);
        }}
        onCancel={() => setConfirmingTransfer(false)}
      />
    </SectionCard>
  );
}

function LeaveCard({
  productionId,
  isOwner,
}: {
  productionId: string;
  isOwner: boolean;
}) {
  const [state, leave] = useActionState(sairDaProducaoAction, {});
  const [confirming, setConfirming] = useState(false);

  return (
    <SectionCard title="Sair da produção">
      <p className="mb-4 text-sm leading-relaxed text-zinc-400">
        {isOwner
          ? 'Você é o dono: transfira a posse para outro membro antes de sair. Uma produção nunca fica sem dono.'
          : 'Você deixa de ver a sala. Para voltar, precisará do código de convite.'}
      </p>

      <form action={leave} id="sair-da-producao" className="hidden">
        <input type="hidden" name="productionId" value={productionId} />
      </form>

      <FormError>{state.error}</FormError>

      <Button
        variant="ghost"
        className="text-red-400"
        disabled={isOwner}
        onClick={() => setConfirming(true)}
      >
        Sair da produção
      </Button>

      <ConfirmDialog
        open={confirming}
        title="Sair desta produção?"
        description="Você perde o acesso à sala até entrar de novo pelo código."
        confirmLabel="Sair"
        destructive
        onConfirm={() => {
          setConfirming(false);
          submitForm('sair-da-producao');
        }}
        onCancel={() => setConfirming(false)}
      />
    </SectionCard>
  );
}

/**
 * `requestSubmit`, e não `dispatchEvent('submit')`: só o primeiro dispara a Server Action
 * do `<form action={...}>` do React. O segundo emite o evento sem submeter nada — some
 * silenciosamente, que é o pior modo de falhar.
 */
function submitForm(id: string) {
  const form = document.getElementById(id);
  if (form instanceof HTMLFormElement) form.requestSubmit();
}
