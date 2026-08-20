import { requireUser } from '@/lib/auth/session';

/**
 * Casca das telas com conta.
 *
 * Ela exige sessão — **no servidor**, uma vez, para todo o grupo de rotas. Nenhuma tela
 * filha renderiza sem sessão válida, e nenhuma delas precisa lembrar de checar (ADR-025).
 *
 * E oferece o pulo para o conteúdo. O cabeçalho fica no topo de toda tela; sem o atalho,
 * quem navega por teclado ou leitor de tela atravessa "voltar", "conta" e "sair" de novo
 * a cada rota, para chegar sempre no mesmo lugar. O link só aparece quando recebe foco —
 * quem usa o dedo nunca o vê.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();

  return (
    <>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:border focus:border-brand/40 focus:bg-surface-raised focus:px-4 focus:py-3 focus:text-sm focus:font-medium focus:text-zinc-100"
      >
        Pular para o conteúdo
      </a>
      {children}
    </>
  );
}
