'use client';

import { useActionState } from 'react';

import { SectionCard } from '@/components/layout/SectionCard';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { ClapperboardIcon, UsersIcon } from '@/components/ui/icons';
import { FormError } from '@/features/auth/AuthCard';

import { criarProducaoAction, entrarPorCodigoAction } from './actions';
import { DEPARTMENT_OPTIONS } from './options';
import { SubmitButton } from './SubmitButton';

/**
 * Os dois caminhos de entrada na plataforma.
 *
 * Campos não controlados: o valor pertence ao `<form>`, que já o entrega à Server Action.
 * Um `useState` por campo faria o mesmo trabalho duas vezes.
 */
export function ProductionsForms() {
  return (
    <div className="flex flex-col gap-4">
      <JoinForm />
      <CreateForm />
    </div>
  );
}

function JoinForm() {
  const [state, action] = useActionState(entrarPorCodigoAction, {});

  return (
    <SectionCard
      title="Entrar por código"
      icon={<UsersIcon size={18} />}
      collapsible
      defaultOpen={false}
      summary="Recebi um convite"
    >
      <form action={action} className="flex flex-col gap-4">
        <TextField
          label="Código da sala"
          name="joinCode"
          placeholder="FILMEX-8K2P"
          autoCapitalize="characters"
          required
        />
        <SelectField
          label="Seu departamento"
          name="department"
          options={DEPARTMENT_OPTIONS}
          hint="Um administrador pode corrigir depois."
          required
        />
        <TextField label="Sua função (opcional)" name="jobTitle" placeholder="1º AC" />

        <FormError>{state.error}</FormError>

        <SubmitButton variant="secondary" size="lg" fullWidth pendingLabel="Entrando…">
          Entrar na sala
        </SubmitButton>
      </form>
    </SectionCard>
  );
}

function CreateForm() {
  const [state, action] = useActionState(criarProducaoAction, {});

  return (
    <SectionCard
      title="Criar produção"
      icon={<ClapperboardIcon size={18} />}
      collapsible
      defaultOpen={false}
      summary="Sou eu que abro a sala"
    >
      <form action={action} className="flex flex-col gap-4">
        <TextField label="Nome da produção" name="name" placeholder="Filme X" required />
        <TextField label="Produtora (opcional)" name="company" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Direção (opcional)" name="director" />
          <TextField label="Fotografia (opcional)" name="dop" />
        </div>
        <SelectField
          label="Seu departamento"
          name="department"
          options={DEPARTMENT_OPTIONS}
          required
        />

        <FormError>{state.error}</FormError>

        <SubmitButton variant="primary" size="lg" fullWidth pendingLabel="Criando…">
          Criar produção
        </SubmitButton>
      </form>
    </SectionCard>
  );
}
