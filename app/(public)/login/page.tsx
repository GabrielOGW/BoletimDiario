import { Suspense } from 'react';
import type { Metadata } from 'next';

import { LoginForm } from '@/features/auth/LoginForm';

export const metadata: Metadata = { title: 'Entrar' };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
