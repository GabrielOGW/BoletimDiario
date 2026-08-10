'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { signInSchema } from '@/lib/contracts/auth';
import { signIn } from '@/lib/auth/client';

import { AuthCard, FormError } from './AuthCard';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const voltarPara = params.get('voltarPara');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados');
      return;
    }

    setBusy(true);
    const { error: authError } = await signIn.email({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setBusy(false);

    if (authError) {
      // Mensagem única de propósito: dizer "este e-mail não existe" entrega quem tem
      // conta na plataforma para quem estiver testando endereços.
      setError('E-mail ou senha incorretos.');
      return;
    }

    router.push(voltarPara ?? '/producoes');
    router.refresh();
  }

  return (
    <AuthCard
      title="Entrar"
      description="Sua sessão fica no aparelho — você não precisa entrar de novo em locação."
      footer={
        <div className="flex flex-col gap-2">
          <Link href="/recuperar-senha" className="underline underline-offset-2">
            Esqueci minha senha
          </Link>
          <span>
            Ainda não tem conta?{' '}
            <Link href="/cadastro" className="text-zinc-200 underline underline-offset-2">
              Criar conta
            </Link>
          </span>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
          autoComplete="current-password"
          required
          disabled={busy}
          clearable={false}
        />

        <FormError>{error}</FormError>

        <Button type="submit" variant="primary" size="lg" fullWidth disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </AuthCard>
  );
}
