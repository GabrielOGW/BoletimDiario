'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { BoletimEditor } from '@/features/boletins/BoletimEditor';

function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink text-sm text-zinc-500">
      Carregando…
    </div>
  );
}

function EditarContent() {
  const params = useSearchParams();
  return <BoletimEditor id={params.get('id')} />;
}

export default function EditarPage() {
  return (
    <Suspense fallback={<Loading />}>
      <EditarContent />
    </Suspense>
  );
}
