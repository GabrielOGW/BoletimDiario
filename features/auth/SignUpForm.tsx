'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { MIN_PASSWORD_LENGTH, signUpSchema } from '@/lib/contracts/auth';
import { signUp } from '@/lib/auth/client';

import { AuthCard, FormError } from './AuthCard';

export function SignUpForm() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    const parsed = signUpSchema.safeParse({ name, email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados');
      return;
    }

    setBusy(true);
    const { error: authError } = await signUp.email({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setBusy(false);

    if (authError) {
      setError(
        authError.status === 422
          ? 'Já existe uma conta com este e-mail.'
          : 'Não foi possível criar a conta. Tente de novo.',
      );
      return;
    }

    router.push('/producoes');
    router.refresh();
  }

  return (
    <AuthCard
      title="Criar conta"
      description="A conta serve para entrar em salas de produção e sincronizar com a equipe."
      footer={
        <span>
          Já tem conta?{' '}
          <Link href="/login" className="text-zinc-200 underline underline-offset-2">
            Entrar
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextField
          label="Nome"
          value={name}
          onChange={setName}
          hint="É o nome que aparece nos boletins."
          autoComplete="name"
          autoCapitalize="words"
          required
          disabled={busy}
        />
        <TextField
          label="E-mail"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          autoCapitalize="none"
          required
          disabled={busy}
          clearable={false}
        />
        <TextField
          label="Senha"
          type="password"
          value={password}
          onChange={setPassword}
          hint={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres.`}
          autoComplete="new-password"
          required
          disabled={busy}
          clearable={false}
        />

        <FormError>{error}</FormError>

        <Button type="submit" variant="primary" size="lg" fullWidth disabled={busy}>
          {busy ? 'Criando…' : 'Criar conta'}
        </Button>
      </form>
    </AuthCard>
  );
}
