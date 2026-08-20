'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/utils/cn';

/**
 * Navegação da sala. Fica no rodapé porque é onde o polegar chega — a mesma razão pela
 * qual a barra de ações do boletim é fixa embaixo.
 */
export function RoomNav({ productionId }: { productionId: string }) {
  const pathname = usePathname();
  const base = `/p/${productionId}`;

  const items = [
    { href: base, label: 'Sala' },
    { href: `${base}/diarias`, label: 'Diárias' },
    { href: `${base}/membros`, label: 'Equipe' },
    { href: `${base}/equipamentos`, label: 'Kit' },
  ];

  return (
    // A fixação no rodapé passou para o contêiner do layout, que agora empilha a barra de
    // diária ativa em cima desta navegação (Fase 11). Dois `sticky` aninhados só fariam o
    // de dentro virar decoração.
    <nav className="border-t border-line bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex w-full max-w-2xl">
        {items.map((item) => {
          const active =
            item.href === base ? pathname === base : pathname.startsWith(item.href);

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[56px] items-center justify-center text-sm font-medium transition',
                  active
                    ? 'border-t-2 border-brand text-brand'
                    : 'border-t-2 border-transparent text-zinc-400 hover:text-zinc-100',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
