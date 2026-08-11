'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Boletim } from '@/types/boletim';
import { useBoletins } from '@/hooks/useBoletins';
import { useMounted } from '@/hooks/useMounted';
import { boletimTitle } from '@/utils/boletim-stats';

import { AppHeader } from '@/components/layout/AppHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { StickyActionBar } from '@/components/layout/StickyActionBar';
import { SearchInput } from '@/components/ui/SearchInput';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { OfflineBadge } from '@/components/pwa/OfflineBadge';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import {
  ArrowLeftIcon,
  ClapperboardIcon,
  PlusIcon,
  SearchIcon,
  UsersIcon,
} from '@/components/ui/icons';

import { BoletimCard } from '@/features/boletins/BoletimCard';
import { BackupControls } from '@/features/backup/BackupControls';

export function BoletimListView() {
  const router = useRouter();
  const mounted = useMounted();
  const { all, results, query, setQuery, loaded, create, duplicate, remove } =
    useBoletins();
  const [pendingDelete, setPendingDelete] = useState<Boletim | null>(null);

  const ready = mounted && loaded;

  const handleNew = () => {
    const created = create();
    router.push(`/legado/editar?id=${created.id}`);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      <AppHeader
        title="Boletim Diário de Câmera"
        subtitle={ready ? `${all.length} boletim(ns) neste aparelho` : 'Carregando…'}
        right={<OfflineBadge />}
      />

      <main className="flex-1 py-4">
        <PageContainer className="space-y-4">
          <InstallPrompt />
          <BackupControls count={all.length} />

          {/* A porta para a plataforma. Fica aqui, e não no lugar desta tela: usar o
              boletim sem conta continua sendo um modo suportado, não uma versão
              degradada (features/camera.md §7). */}
          <Link
            href="/producoes"
            className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition hover:bg-surface-hover"
          >
            <UsersIcon size={20} className="shrink-0 text-brand" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-zinc-100">
                Trabalhar com a equipe
              </span>
              <span className="block text-xs leading-relaxed text-zinc-500">
                Produções sincronizadas, com Som e Continuidade na mesma diária.
              </span>
            </span>
            <ArrowLeftIcon size={16} className="shrink-0 rotate-180 text-zinc-500" />
          </Link>

          {all.length > 0 ? (
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Buscar por título, produtora, cena…"
            />
          ) : null}

          {!ready ? (
            <ul className="space-y-3" aria-hidden>
              {[0, 1, 2].map((index) => (
                <li
                  key={index}
                  className="h-28 animate-pulse rounded-2xl border border-line bg-surface"
                />
              ))}
            </ul>
          ) : all.length === 0 ? (
            <EmptyState
              icon={<ClapperboardIcon size={40} />}
              title="Nenhum boletim ainda"
              description="Crie seu primeiro boletim. Tudo fica salvo neste aparelho e funciona offline em set."
              action={
                <Button
                  variant="primary"
                  size="lg"
                  leftIcon={<PlusIcon size={20} />}
                  onClick={handleNew}
                >
                  Criar boletim
                </Button>
              }
            />
          ) : results.length === 0 ? (
            <EmptyState
              icon={<SearchIcon size={36} />}
              title="Nada encontrado"
              description="Nenhum boletim corresponde à busca. Tente outro termo."
            />
          ) : (
            <ul className="space-y-3">
              {results.map((boletim) => (
                <BoletimCard
                  key={boletim.id}
                  boletim={boletim}
                  onView={() => router.push(`/legado/visualizar?id=${boletim.id}`)}
                  onDuplicate={() => duplicate(boletim.id)}
                  onDelete={() => setPendingDelete(boletim)}
                />
              ))}
            </ul>
          )}
        </PageContainer>
      </main>

      <StickyActionBar>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          leftIcon={<PlusIcon size={20} />}
          onClick={handleNew}
        >
          Novo boletim
        </Button>
      </StickyActionBar>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Excluir boletim?"
        description={
          pendingDelete
            ? `"${boletimTitle(pendingDelete)}" será removido deste dispositivo. Esta ação não pode ser desfeita.`
            : ''
        }
        confirmLabel="Excluir"
        destructive
        onConfirm={() => {
          if (pendingDelete) remove(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
