'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Boletim, Cena } from '@/types/boletim';
import { useBoletim } from '@/hooks/useBoletim';
import { remove as removeBoletim } from '@/lib/storage';
import { createCena, createMembroEquipe, createMidiaSuporte } from '@/lib/factory';
import { computeStats } from '@/utils/boletim-stats';
import { formatDateBR } from '@/utils/date';
import { uid } from '@/utils/id';

import { AppHeader } from '@/components/layout/AppHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { StickyActionBar } from '@/components/layout/StickyActionBar';
import { SaveStateBadge } from '@/components/layout/SaveStateBadge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { OfflineBadge } from '@/components/pwa/OfflineBadge';
import { EyeIcon, TrashIcon } from '@/components/ui/icons';

import { ProducaoSection } from '@/features/boletins/sections/ProducaoSection';
import { CameraSection } from '@/features/boletins/sections/CameraSection';
import { CenasSection } from '@/features/boletins/sections/CenasSection';
import { MidiaSection } from '@/features/boletins/sections/MidiaSection';
import { CenasDoDiaSection } from '@/features/boletins/sections/CenasDoDiaSection';
import { HorariosSection } from '@/features/boletins/sections/HorariosSection';
import { EquipeSection } from '@/features/boletins/sections/EquipeSection';
import { ObservacoesGeraisSection } from '@/features/boletins/sections/ObservacoesGeraisSection';

function StateScreen({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      <AppHeader title={title} backHref="/" />
      <PageContainer className="flex flex-1 flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-zinc-400">{message}</p>
      </PageContainer>
    </div>
  );
}

export function BoletimEditor({ id }: { id: string | null }) {
  const router = useRouter();
  const { boletim, status, saveState, update } = useBoletim(id);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (status === 'loading') {
    return <StateScreen title="Carregando…" message="Abrindo boletim." />;
  }
  if (status === 'not-found' || !boletim) {
    return (
      <StateScreen
        title="Boletim não encontrado"
        message="Este boletim não existe neste dispositivo. Volte e selecione outro."
      />
    );
  }

  const stats = computeStats(boletim);

  const setProducao = (value: Partial<Boletim['producao']>) =>
    update((prev) => ({ ...prev, producao: { ...prev.producao, ...value } }));
  const setCamera = (value: Partial<Boletim['camera']>) =>
    update((prev) => ({ ...prev, camera: { ...prev.camera, ...value } }));
  const setCenasDoDia = (value: Partial<Boletim['cenasDoDia']>) =>
    update((prev) => ({ ...prev, cenasDoDia: { ...prev.cenasDoDia, ...value } }));
  const setHorarios = (value: Partial<Boletim['horarios']>) =>
    update((prev) => ({ ...prev, horarios: { ...prev.horarios, ...value } }));
  const setObservacoes = (value: string) =>
    update((prev) => ({ ...prev, observacoesGerais: value }));

  // Cenas
  const addCena = () =>
    update((prev) => ({ ...prev, cenas: [...prev.cenas, createCena()] }));
  const changeCena = (cenaId: string, next: Cena) =>
    update((prev) => ({
      ...prev,
      cenas: prev.cenas.map((cena) => (cena.id === cenaId ? next : cena)),
    }));
  const removeCena = (cenaId: string) =>
    update((prev) => ({
      ...prev,
      cenas: prev.cenas.filter((cena) => cena.id !== cenaId),
    }));
  const duplicateCena = (cenaId: string) =>
    update((prev) => {
      const sourceIndex = prev.cenas.findIndex((cena) => cena.id === cenaId);
      if (sourceIndex < 0) return prev;
      const source = prev.cenas[sourceIndex];
      const copy: Cena = {
        ...source,
        id: uid('cena'),
        numeroNome: source.numeroNome ? `${source.numeroNome} (cópia)` : '',
        tecnica: { ...source.tecnica },
        optica: { ...source.optica },
        takes: source.takes.map((take) => ({ ...take, id: uid('take') })),
      };
      const cenas = [...prev.cenas];
      cenas.splice(sourceIndex + 1, 0, copy);
      return { ...prev, cenas };
    });
  const moveCena = (index: number, dir: -1 | 1) =>
    update((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.cenas.length) return prev;
      const cenas = [...prev.cenas];
      const [item] = cenas.splice(index, 1);
      cenas.splice(target, 0, item);
      return { ...prev, cenas };
    });

  // Mídia
  const addMidia = () =>
    update((prev) => ({
      ...prev,
      midiaSuporte: [...prev.midiaSuporte, createMidiaSuporte()],
    }));
  const changeMidia = (
    midiaId: string,
    value: Partial<Boletim['midiaSuporte'][number]>,
  ) =>
    update((prev) => ({
      ...prev,
      midiaSuporte: prev.midiaSuporte.map((item) =>
        item.id === midiaId ? { ...item, ...value } : item,
      ),
    }));
  const removeMidia = (midiaId: string) =>
    update((prev) => ({
      ...prev,
      midiaSuporte: prev.midiaSuporte.filter((item) => item.id !== midiaId),
    }));

  // Equipe
  const addMembro = () =>
    update((prev) => ({
      ...prev,
      equipeCamera: [...prev.equipeCamera, createMembroEquipe()],
    }));
  const changeMembro = (
    membroId: string,
    value: Partial<Boletim['equipeCamera'][number]>,
  ) =>
    update((prev) => ({
      ...prev,
      equipeCamera: prev.equipeCamera.map((item) =>
        item.id === membroId ? { ...item, ...value } : item,
      ),
    }));
  const removeMembro = (membroId: string) =>
    update((prev) => ({
      ...prev,
      equipeCamera: prev.equipeCamera.filter((item) => item.id !== membroId),
    }));

  const handleDelete = () => {
    removeBoletim(boletim.id);
    router.replace('/');
  };

  const headerTitle = boletim.producao.tituloProjeto.trim() || 'Novo boletim';
  const headerSubtitle = [
    formatDateBR(boletim.producao.data),
    boletim.producao.diaDiaria && `Diária ${boletim.producao.diaDiaria}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      <AppHeader
        title={headerTitle}
        subtitle={headerSubtitle}
        backHref="/"
        right={
          <>
            <OfflineBadge />
            <SaveStateBadge state={saveState} />
          </>
        }
      />

      <main className="flex-1 py-4">
        <PageContainer className="space-y-4">
          <ProducaoSection value={boletim.producao} onChange={setProducao} />
          <CameraSection value={boletim.camera} onChange={setCamera} />

          <CenasSection
            cenas={boletim.cenas}
            onAdd={addCena}
            onChangeCena={changeCena}
            onRemoveCena={removeCena}
            onDuplicateCena={duplicateCena}
            onMoveCena={moveCena}
          />

          <MidiaSection
            items={boletim.midiaSuporte}
            onAdd={addMidia}
            onChange={changeMidia}
            onRemove={removeMidia}
          />

          <CenasDoDiaSection
            value={boletim.cenasDoDia}
            onChange={setCenasDoDia}
            auto={{ totalTakes: stats.totalTakes, takesAprovados: stats.takesAprovados }}
          />

          <HorariosSection value={boletim.horarios} onChange={setHorarios} />

          <EquipeSection
            items={boletim.equipeCamera}
            onAdd={addMembro}
            onChange={changeMembro}
            onRemove={removeMembro}
          />

          <ObservacoesGeraisSection
            value={boletim.observacoesGerais}
            onChange={setObservacoes}
          />
        </PageContainer>
      </main>

      <StickyActionBar>
        <Button
          variant="ghost"
          leftIcon={<TrashIcon size={18} />}
          onClick={() => setConfirmDelete(true)}
          className="text-red-400 hover:bg-red-500/15 hover:text-red-300"
        >
          Excluir
        </Button>
        <Button
          variant="primary"
          fullWidth
          leftIcon={<EyeIcon size={18} />}
          onClick={() => router.push(`/visualizar?id=${boletim.id}`)}
        >
          Visualizar / PDF
        </Button>
      </StickyActionBar>

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir boletim?"
        description="Esta ação remove o boletim deste dispositivo e não pode ser desfeita. Considere exportar um backup antes."
        confirmLabel="Excluir"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
