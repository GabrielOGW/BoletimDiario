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
  UploadIcon,
  UsersIcon,
} from '@/components/ui/icons';

import { BoletimCard } from '@/features/boletins/BoletimCard';
import { BackupControls } from '@/features/backup/BackupControls';
import { ContinuarDiaria } from '@/features/diaria/ContinuarDiaria';

import { ListaLocal, useItensLocais } from '@/features/boletins-locais/ListaLocal';
import {
  editorLocalDoModulo,
  type ModuloDeDepartamento,
} from '@/features/diaria/departamentos';
import { criaBoletimContinuidade } from '@/lib/local/continuidade';
import { criaBoletimSom } from '@/lib/local/som';
import { storeContinuidade, storeSom } from '@/lib/local/store';

import { EscolhaDepartamento } from './EscolhaDepartamento';

export function BoletimListView() {
  const router = useRouter();
  const mounted = useMounted();
  const { all, results, query, setQuery, loaded, create, duplicate, remove } =
    useBoletins();
  const [pendingDelete, setPendingDelete] = useState<Boletim | null>(null);
  const [escolhendo, setEscolhendo] = useState(false);

  const ready = mounted && loaded;

  /**
   * O Boletim de Câmera local — exatamente o que "Novo boletim" sempre fez. Agora é uma
   * das três escolhas da tela de departamento (ADR-040), e não o gesto direto do botão.
   */
  const criaBoletimDeCamera = () => {
    setEscolhendo(false);
    const created = create();
    router.push(`/legado/editar?id=${created.id}`);
  };

  const handleNew = () => setEscolhendo(true);

  /**
   * Som e Continuidade nascem como o de Câmera: no aparelho, sem conta, sem diária
   * (ADR-043). Criar e abrir o editor — o próximo toque já é registrar.
   */
  const escolhe = (modulo: ModuloDeDepartamento) => {
    if (modulo === 'camera') {
      criaBoletimDeCamera();
      return;
    }
    setEscolhendo(false);
    const criado =
      modulo === 'som'
        ? storeSom.upsert(criaBoletimSom())
        : storeContinuidade.upsert(criaBoletimContinuidade());
    router.push(editorLocalDoModulo(modulo, criado.id));
  };

  const locais = useItensLocais(query);
  const total = all.length + locais.total;

  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      <AppHeader
        title="Boletim Diário"
        subtitle={ready ? `${total} boletim(ns) neste aparelho` : 'Carregando…'}
        right={<OfflineBadge />}
      />

      <main className="flex-1 py-4">
        <PageContainer className="space-y-4">
          <InstallPrompt />

          {/* O caminho curto (Fase 11): quem tem uma diária aberta chega nela em **um
              toque**, na primeira tela que o app abre — sem lista, sem sala, sem rede.
              Quem não tem não vê nada, e `/` continua sendo o boletim local (ADR-032). */}
          <ContinuarDiaria />

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
              <span className="block text-xs leading-relaxed text-zinc-400">
                Produções sincronizadas, com Som e Continuidade na mesma diária.
              </span>
            </span>
            <ArrowLeftIcon size={16} className="shrink-0 rotate-180 text-zinc-400" />
          </Link>

          {all.length > 0 ? (
            <Link
              href="/legado/importar"
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition hover:bg-surface-hover"
            >
              <UploadIcon size={20} className="shrink-0 text-zinc-400" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-zinc-100">
                  Levar estes boletins para a plataforma
                </span>
                <span className="block text-xs leading-relaxed text-zinc-400">
                  Opcional. Nada é apagado daqui, e importar de novo não duplica.
                </span>
              </span>
              <ArrowLeftIcon size={16} className="shrink-0 rotate-180 text-zinc-400" />
            </Link>
          ) : null}

          {total > 0 ? (
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
          ) : total === 0 ? (
            <EmptyState
              icon={<ClapperboardIcon size={40} />}
              title="Nenhum boletim ainda"
              description="Crie seu primeiro boletim de câmera, continuidade ou som. Tudo fica salvo neste aparelho e funciona offline em set."
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
          ) : results.length === 0 && locais.itens.length === 0 ? (
            <EmptyState
              icon={<SearchIcon size={36} />}
              title="Nada encontrado"
              description="Nenhum boletim corresponde à busca. Tente outro termo."
            />
          ) : (
            <>
              {results.length > 0 ? (
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
              ) : null}
              <ListaLocal itens={locais.itens} />
            </>
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

      <EscolhaDepartamento
        aberta={escolhendo}
        onFechar={() => setEscolhendo(false)}
        onEscolhe={escolhe}
      />

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
