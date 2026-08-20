'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { AppHeader } from '@/components/layout/AppHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { EmptyState } from '@/components/ui/EmptyState';
import { ClapperboardIcon } from '@/components/ui/icons';
import { caminhoDoAtalho, ultimaDiaria } from '@/lib/atalhos';

/**
 * O destino do atalho "Última diária" do ícone do app (Fase 11).
 *
 * Fica **fora** de `(app)` de propósito: aquele grupo resolve a sessão no servidor, e
 * atravessar o servidor é justamente o que este caminho não pode exigir. Aqui não há
 * consulta nenhuma — o endereço sai do `localStorage` e o navegador vai. Funciona em modo
 * avião, que é a única razão de este atalho existir.
 *
 * Se a diária pedir sessão do outro lado, o próprio `(app)` manda para o login: esta rota
 * não decide sobre acesso, só sobre destino.
 */
export default function ContinuarPage() {
  const [estado, setEstado] = useState<'ABRINDO' | 'VAZIO'>('ABRINDO');

  useEffect(() => {
    const atalho = ultimaDiaria();
    if (!atalho) {
      setEstado('VAZIO');
      return;
    }

    // `replace`, e não `push`: o atalho é um trilho, não uma parada. Voltar da diária tem
    // de sair do app, e não cair de novo nesta tela, que mandaria a pessoa para frente.
    window.location.replace(caminhoDoAtalho(atalho));
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      <AppHeader title="Continuar" backHref="/" />

      <PageContainer className="flex-1 py-4">
        {estado === 'ABRINDO' ? (
          <p className="px-1 py-8 text-center text-sm text-zinc-500">
            Abrindo a última diária…
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <EmptyState
              icon={<ClapperboardIcon size={40} />}
              title="Nenhuma diária aberta ainda neste aparelho"
              description="Assim que você abrir uma diária, este atalho volta direto para ela — inclusive sem rede."
            />
            <Link
              href="/producoes"
              className="text-center text-sm font-medium text-brand underline underline-offset-2"
            >
              Ir para minhas produções
            </Link>
          </div>
        )}
      </PageContainer>
    </div>
  );
}
