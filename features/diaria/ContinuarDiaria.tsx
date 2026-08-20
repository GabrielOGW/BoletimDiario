'use client';

import { useEffect, useState } from 'react';

import { ClapperboardIcon } from '@/components/ui/icons';
import { caminhoDoAtalho, ultimaDiaria, type AtalhoDeDiaria } from '@/lib/atalhos';
import { cn } from '@/utils/cn';

const NOME_DO_MODULO: Record<string, string> = {
  camera: 'Câmera',
  som: 'Som',
  continuidade: 'Continuidade',
  consolidado: 'Diária consolidada',
};

/**
 * "Continuar de onde parei" (Fase 11).
 *
 * O atalho que transforma quatro toques em um. Aparece **só quando há para onde voltar** —
 * quem nunca abriu uma diária não vê nada, e a tela continua exatamente como era.
 *
 * Lê `localStorage` no efeito, e não no render, de propósito: no servidor não há
 * `localStorage`, e desenhar no primeiro render um botão que talvez não exista causaria
 * hidratação divergente — a tela piscaria com um botão fantasma, justamente na tela que
 * precisa abrir limpa.
 *
 * É um `<a>` e não um `<Link>`: a navegação sai do Boletim local para a plataforma, dois
 * mundos com camadas de dados diferentes, e uma recarga de verdade é o que garante que o
 * destino comece do zero. Ele também é o único link para a plataforma que existe numa tela
 * que precisa abrir sem rede.
 */
export function ContinuarDiaria({ className }: { className?: string }) {
  const [atalho, setAtalho] = useState<AtalhoDeDiaria | null>(null);

  useEffect(() => {
    setAtalho(ultimaDiaria());
  }, []);

  if (!atalho) return null;

  return (
    <a
      href={caminhoDoAtalho(atalho)}
      className={cn(
        'flex min-h-[64px] items-center gap-3 rounded-2xl border border-brand/40 bg-brand-soft px-4 py-3 transition hover:brightness-110',
        className,
      )}
    >
      <span className="text-brand">
        <ClapperboardIcon size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-zinc-100">
          Continuar · {NOME_DO_MODULO[atalho.modulo] ?? 'Diária'}
        </span>
        <span className="block truncate text-xs text-zinc-400">
          {atalho.producao} · {atalho.diaria}
        </span>
      </span>
      <span aria-hidden className="text-brand">
        →
      </span>
    </a>
  );
}
