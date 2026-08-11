import { requireUser } from '@/lib/auth/session';

/**
 * Casca das telas com conta.
 *
 * A única coisa que ela faz é exigir sessão — e faz isso **no servidor**, uma vez, para
 * todo o grupo de rotas. Nenhuma tela filha renderiza sem sessão válida, e nenhuma delas
 * precisa lembrar de checar (ADR-025).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return children;
}
