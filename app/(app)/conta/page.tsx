import type { Metadata } from 'next';

import { AppHeader } from '@/components/layout/AppHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { SectionCard } from '@/components/layout/SectionCard';
import { HardDriveIcon } from '@/components/ui/icons';
import { listarDispositivos } from '@/lib/auth/dispositivos';
import { requireUser } from '@/lib/auth/session';
import { DispositivosList } from '@/features/auth/DispositivosList';

export const metadata: Metadata = { title: 'Minha conta' };

/**
 * A conta: quem é, e onde está aberta.
 *
 * Server Component lendo a sessão no servidor, como o resto da sala — nada de Dexie e
 * nada de fronteira offline (ADR-016). É tela de preparação, feita sentado e com sinal.
 */
export default async function ContaPage() {
  const user = await requireUser();
  const dispositivos = await listarDispositivos();

  return (
    <>
      <AppHeader title="Minha conta" subtitle={user.email} backHref="/producoes" />

      <PageContainer className="flex flex-col gap-4 py-4 pb-16">
        <SectionCard title="Aparelhos conectados" icon={<HardDriveIcon size={18} />}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-zinc-400">
              A sessão dura 90 dias e não é reverificada para preencher a diária — é o que
              faz o app funcionar sem sinal. Perdeu o telefone? Desconecte-o aqui.
            </p>
            <DispositivosList dispositivos={dispositivos} />
          </div>
        </SectionCard>
      </PageContainer>
    </>
  );
}
