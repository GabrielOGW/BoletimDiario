'use client';

import { useSyncExternalStore } from 'react';

import { Badge } from '@/components/ui/Badge';
import { WifiOffIcon } from '@/components/ui/icons';
import { getSyncSnapshot, subscribeSync, type SyncSnapshot } from '@/lib/sync/engine';

/** O estado do motor, sem biblioteca de estado: `useSyncExternalStore` é do React. */
export function useSyncStatus(): SyncSnapshot {
  return useSyncExternalStore(subscribeSync, getSyncSnapshot, getSyncSnapshot);
}

/**
 * O indicador de sincronização.
 *
 * **Informa, nunca bloqueia.** Não existe spinner que impeça digitar nem "aguarde
 * sincronizar" antes de criar o próximo take: a fila acumula e o trabalho continua. O
 * que o usuário precisa saber é uma coisa só — se o que ele escreveu já saiu do aparelho.
 */
export function SyncIndicator() {
  const { server, sync, pending, conflicts, message } = useSyncStatus();

  if (sync === 'OUTDATED') {
    return (
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-full border border-brand/40 bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand"
      >
        ⬆ Atualize o app
      </button>
    );
  }

  if (conflicts > 0) {
    return <Badge tone="brand">▲ {conflicts} conflito(s)</Badge>;
  }

  if (server === 'UNREACHABLE') {
    return (
      <Badge tone="muted">
        <WifiOffIcon size={13} />
        {pending > 0 ? `${pending} pendente(s)` : 'Offline'}
      </Badge>
    );
  }

  if (sync === 'ERROR') {
    return <Badge tone="muted">✕ {message ?? 'Erro de sincronização'}</Badge>;
  }

  if (sync === 'SYNCING') return <Badge tone="neutral">⟳ Sincronizando</Badge>;
  if (pending > 0) return <Badge tone="neutral">● {pending} pendente(s)</Badge>;

  return <Badge tone="approved">● Sincronizado</Badge>;
}
