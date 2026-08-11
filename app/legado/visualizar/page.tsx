'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { BoletimView } from '@/features/boletins/BoletimView';

function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink text-sm text-zinc-500">
      Carregando…
    </div>
  );
}

function VisualizarContent() {
  const params = useSearchParams();
  return <BoletimView id={params.get('id')} />;
}

export default function VisualizarPage() {
  return (
    <Suspense fallback={<Loading />}>
      <VisualizarContent />
    </Suspense>
  );
}
