'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { MIN_PASSWORD_LENGTH, resetPasswordSchema } from '@/lib/contracts/auth';
import { resetPassword } from '@/lib/auth/client';

import { AuthCard, FormError, FormNotice } from './AuthCard';

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <AuthCard
        title="Link inválido"
        footer={
          <Link href="/recuperar-senha" className="underline underline-offset-2">
            Pedir um link novo
          </Link>
        }
      >
        <FormNotice>
          Este link não tem token de redefinição. Ele pode ter sido copiado pela metade ou
          já ter expirado.
        </FormNotice>
      </AuthCard>
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    if (password !== confirmation) {
      setError('As senhas não são iguais.');
      return;
    }

    const parsed = resetPasswordSchema.safeParse({ token, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique a senha');
      return;
    }

    setBusy(true);
    const { error: authError } = await resetPassword({
      token: parsed.data.token,
      newPassword: parsed.data.password,
    });
    setBusy(false);

    if (authError) {
      setError('O link expirou ou já foi usado. Peça um novo.');
      return;
    }

    router.push('/login');
    router.refresh();
  }

  return (
    <AuthCard title="Nova senha" description="Escolha uma senha para voltar a entrar.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextField
          label="Nova senha"
          type="password"
          value={password}
          onChange={setPassword}
          hint={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres.`}
          autoComplete="new-password"
          required
          disabled={busy}
          clearable={false}
        />
        <TextField
          label="Repetir a senha"
          type="password"
          value={confirmation}
          onChange={setConfirmation}
          autoComplete="new-password"
          required
          disabled={busy}
          clearable={false}
        />

        <FormError>{error}</FormError>

        <Button type="submit" variant="primary" size="lg" fullWidth disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar nova senha'}
        </Button>
      </form>
    </AuthCard>
  );
}
