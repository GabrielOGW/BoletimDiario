import Link from 'next/link';

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ink px-6 text-center">
      <h1 className="text-xl font-semibold text-white">Você está offline</h1>
      <p className="max-w-sm text-sm text-zinc-400">
        Esta tela ainda não foi salva para uso offline. Seus boletins já abertos continuam
        disponíveis normalmente.
      </p>
      <Link
        href="/"
        className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-ink"
      >
        Voltar ao início
      </Link>
    </div>
  );
}
