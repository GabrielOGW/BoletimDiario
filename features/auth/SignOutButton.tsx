'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { signOut } from '@/lib/auth/client';

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await signOut();
        // `refresh` além do `push`: sem ele o layout servidor continuaria em cache com a
        // sessão antiga e a tela seguinte piscaria logada.
        router.push('/login');
        router.refresh();
      }}
    >
      {busy ? 'Saindo…' : 'Sair'}
    </Button>
  );
}
