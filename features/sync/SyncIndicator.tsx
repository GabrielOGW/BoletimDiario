'use client';

import { useSyncExternalStore, type ReactNode } from 'react';

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
        <Glifo>⬆</Glifo> Atualize o app
      </button>
    );
  }

  /**
   * `role="status"` e não `alert`: o estado do sync **informa e nunca bloqueia** — o
   * mesmo princípio que rege a tela. `alert` interromperia a leitura no meio de um take
   * para dizer que o Wi-Fi caiu, que é justamente a hora de não interromper ninguém.
   *
   * Sem isto, quem usa leitor de tela nunca fica sabendo que ficou offline nem que há
   * anotação pendente — e é a única coisa que este indicador existe para dizer.
   */
  const anuncia = (conteudo: ReactNode) => (
    <span role="status" aria-live="polite">
      {conteudo}
    </span>
  );

  if (conflicts > 0) {
    return anuncia(
      <Badge tone="brand">
        <Glifo>▲</Glifo> {conflicts} conflito(s)
      </Badge>,
    );
  }

  if (server === 'UNREACHABLE') {
    return anuncia(
      <Badge tone="muted">
        <WifiOffIcon size={13} aria-hidden />
        {pending > 0 ? `${pending} pendente(s)` : 'Offline'}
      </Badge>,
    );
  }

  if (sync === 'ERROR') {
    return anuncia(
      <Badge tone="muted">
        <Glifo>✕</Glifo> {message ?? 'Erro de sincronização'}
      </Badge>,
    );
  }

  if (sync === 'SYNCING') {
    return anuncia(
      <Badge tone="neutral">
        <Glifo>⟳</Glifo> Sincronizando
      </Badge>,
    );
  }

  if (pending > 0) {
    return anuncia(
      <Badge tone="neutral">
        <Glifo>●</Glifo> {pending} pendente(s)
      </Badge>,
    );
  }

  return anuncia(
    <Badge tone="approved">
      <Glifo>●</Glifo> Sincronizado
    </Badge>,
  );
}

/**
 * Os símbolos são desenho, não texto.
 *
 * Sem `aria-hidden`, o leitor de tela lê "círculo preto pequeno sincronizado" e "seta
 * para cima atualize o app" — o enfeite passa na frente da informação.
 */
function Glifo({ children }: { children: ReactNode }) {
  return <span aria-hidden>{children}</span>;
}
