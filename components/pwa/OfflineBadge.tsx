'use client';

import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useMounted } from '@/hooks/useMounted';
import { WifiOffIcon } from '@/components/ui/icons';

/** Mostra um selo "Offline" só quando o dispositivo está sem rede. */
export function OfflineBadge() {
  const mounted = useMounted();
  const online = useOnlineStatus();

  if (!mounted || online) return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300">
      <WifiOffIcon size={14} />
      Offline
    </span>
  );
}
