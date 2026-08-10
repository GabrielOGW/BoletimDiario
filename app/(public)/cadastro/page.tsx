import type { Metadata } from 'next';

import { SignUpForm } from '@/features/auth/SignUpForm';

export const metadata: Metadata = { title: 'Criar conta' };

export default function CadastroPage() {
  return <SignUpForm />;
}
