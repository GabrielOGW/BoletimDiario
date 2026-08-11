import { notFound } from 'next/navigation';

import { NotAMemberError, requireMember } from '@/lib/auth/guards';
import { RoomNav } from '@/features/production/RoomNav';

/**
 * Casca da sala.
 *
 * O pertencimento é checado **aqui**, uma vez, antes de qualquer leitura — e quem não é
 * membro recebe 404, não 403: responder "proibido" confirmaria que a produção existe
 * para quem só tem o id (permissions.md §3).
 *
 * As páginas filhas repetem a chamada porque precisam do papel para decidir o que
 * mostrar. Repetir a checagem é barato; deixá-la só no layout seria uma armadilha — um
 * `page.tsx` novo nasceria desprotegido se alguém um dia trocasse o layout de lugar.
 */
export default async function RoomLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ productionId: string }>;
}) {
  const { productionId } = await params;

  try {
    await requireMember(productionId);
  } catch (error) {
    if (error instanceof NotAMemberError) notFound();
    throw error;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex-1">{children}</div>
      <RoomNav productionId={productionId} />
    </div>
  );
}
