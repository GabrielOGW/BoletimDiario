'use client';

import { useState } from 'react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { useMounted } from '@/hooks/useMounted';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { DownloadIcon, ShareIcon, XIcon } from '@/components/ui/icons';

const DISMISS_KEY = 'bdc:install-dismissed';

/** Banner de instalação do PWA — com prompt nativo (Android) ou dica no iOS. */
export function InstallPrompt() {
  const mounted = useMounted();
  const { canInstall, installed, isIOS, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(DISMISS_KEY) === '1',
  );

  if (!mounted || installed || dismissed) return null;
  // Sem prompt nativo e fora do iOS: nada a oferecer.
  if (!canInstall && !isIOS) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <div className="relative flex items-start gap-3 rounded-2xl border border-brand/25 bg-brand-soft/60 p-4">
      <div className="mt-0.5 text-brand">
        <DownloadIcon />
      </div>
      <div className="min-w-0 flex-1 pr-8">
        <p className="text-sm font-semibold text-zinc-100">Instalar como app</p>
        {isIOS && !canInstall ? (
          <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-zinc-400">
            Toque em <ShareIcon size={14} className="inline text-zinc-300" /> Compartilhar
            e depois em{' '}
            <strong className="text-zinc-300">Adicionar à Tela de Início</strong>.
          </p>
        ) : (
          <p className="mt-1 text-xs text-zinc-400">
            Funciona offline em set. Instale para abrir em tela cheia, sem navegador.
          </p>
        )}
        {canInstall ? (
          <Button
            size="sm"
            variant="primary"
            className="mt-3"
            leftIcon={<DownloadIcon size={16} />}
            onClick={() => void promptInstall()}
          >
            Instalar agora
          </Button>
        ) : null}
      </div>
      <div className="absolute right-2 top-2">
        <IconButton label="Dispensar" icon={<XIcon size={18} />} onClick={dismiss} />
      </div>
    </div>
  );
}
