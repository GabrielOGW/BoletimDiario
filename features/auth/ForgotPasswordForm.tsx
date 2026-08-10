'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { forgotPasswordSchema } from '@/lib/contracts/auth';
import { requestPasswordReset } from '@/lib/auth/client';

import { AuthCard, FormError, FormNotice } from './AuthCard';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique o e-mail');
      return;
    }

    setBusy(true);
    const { error: authError } = await requestPasswordReset({
      email: parsed.data.email,
      redirectTo: '/redefinir-senha',
    });
    setBusy(false);

    if (authError) {
      setError('Não foi possível processar o pedido. Tente de novo.');
      return;
    }

    // Confirma mesmo quando o e-mail não existe: responder "esta conta não existe"
    // transformaria esta tela num verificador de quem tem conta na plataforma.
    setSent(true);
  }

  if (sent) {
    return (
      <AuthCard
        title="Pedido registrado"
        footer={
          <Link href="/login" className="underline underline-offset-2">
            Voltar para o login
          </Link>
        }
      >
        <div className="flex flex-col gap-3">
          <FormNotice>
            Se existir uma conta com <strong>{email}</strong>, o link de redefinição foi
            gerado.
          </FormNotice>
          <p className="text-sm leading-relaxed text-zinc-400">
            O envio automático de e-mail ainda não está ativo nesta versão. Fale com quem
            administra a produção para receber o link — ele vale por 1 hora.
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Recuperar senha"
      description="Informe o e-mail da conta e geramos um link para você escolher uma nova senha."
      footer={
        <Link href="/login" className="underline underline-offset-2">
          Voltar para o login
        </Link>
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

        <FormError>{error}</FormError>

        <Button type="submit" variant="primary" size="lg" fullWidth disabled={busy}>
          {busy ? 'Enviando…' : 'Gerar link'}
        </Button>
      </form>
    </AuthCard>
  );
}
