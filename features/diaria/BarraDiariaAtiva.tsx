'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import { ClapperboardIcon } from '@/components/ui/icons';
import { caminhoDoAtalho, ultimaDiaria, type AtalhoDeDiaria } from '@/lib/atalhos';

const NOME_DO_MODULO: Record<string, string> = {
  camera: 'Câmera',
  som: 'Som',
  continuidade: 'Continuidade',
  consolidado: 'Consolidado',
};

/**
 * A barra da diária ativa (Fase 11).
 *
 * Sai da anotação para conferir uma coisa na sala — o kit, quem está na equipe, o horário
 * de call — e voltar custava refazer o caminho inteiro. Com a barra, custa um toque, de
 * qualquer tela da produção.
 *
 * Ela some sozinha em três casos, e cada um importa:
 *
 * - **quando já se está na diária**, porque um botão que leva para onde a pessoa está é
 *   ruído em cima do polegar;
 * - **quando a última diária é de outra produção**, porque atravessar de produção sem
 *   pedir seria a pior surpresa possível numa tela de anotação;
 * - **quando não há atalho nenhum**, e a sala fica exatamente como era.
 */
export function BarraDiariaAtiva({ productionId }: { productionId: string }) {
  const pathname = usePathname();
  const [atalho, setAtalho] = useState<AtalhoDeDiaria | null>(null);

  // Reler a cada mudança de rota: quem acabou de abrir a diária e voltou para a sala tem
  // um atalho novo, e uma barra que só lê na montagem apontaria para o dia anterior.
  useEffect(() => {
    setAtalho(ultimaDiaria());
  }, [pathname]);

  if (!atalho || atalho.productionId !== productionId) return null;

  const destino = caminhoDoAtalho(atalho);
  if (pathname.startsWith(`/p/${productionId}/diarias/${atalho.shootingDayId}`)) {
    return null;
  }

  return (
    <a
      href={destino}
      className="flex min-h-[52px] items-center gap-3 border-t border-brand/30 bg-brand-soft px-4 py-2 transition hover:brightness-110"
    >
      <span className="text-brand">
        <ClapperboardIcon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-zinc-100">
          Voltar à anotação · {NOME_DO_MODULO[atalho.modulo] ?? 'Diária'}
        </span>
        <span className="block truncate text-[11px] text-zinc-400">{atalho.diaria}</span>
      </span>
      <span aria-hidden className="text-brand">
        →
      </span>
    </a>
  );
}
