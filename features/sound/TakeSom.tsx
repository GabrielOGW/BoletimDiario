'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DebouncedTextField } from '@/components/ui/DebouncedTextField';
import { IconButton } from '@/components/ui/IconButton';
import { OptionChips, type OptionChip } from '@/components/ui/OptionChips';
import { ChevronDownIcon, PlusIcon, TrashIcon } from '@/components/ui/icons';
import {
  TAKE_KINDS,
  TAKE_KIND_LABEL,
  TAKE_STATUSES,
  TAKE_STATUS_LABEL,
} from '@/domain/platform/enums';
import type {
  LocalSoundTakeData,
  LocalSoundTakeTrack,
  LocalTake,
} from '@/lib/offline/db';
import { patchEntity, softDelete } from '@/lib/offline/repos/diaria';
import {
  createSoundTrack,
  ensureSoundTakeData,
  ensureSoundTracks,
  patchSoundTakeData,
  patchSoundTrack,
  proximoIndiceDeTrack,
  removeSoundTrack,
} from '@/lib/offline/repos/som';
import { syncNow } from '@/lib/sync/engine';
import { cn } from '@/utils/cn';

import { resumoDeTracks } from './estrutura';

/** Julgamento do Som — os cinco valores de `TakeStatus`, um toque cada (ADR-029). */
const JULGAMENTOS: OptionChip[] = TAKE_STATUSES.map((status) => ({
  valor: status,
  rotulo: TAKE_STATUS_LABEL[status],
}));

/**
 * Natureza do take — do take **compartilhado**, não do Som (ADR-029).
 *
 * `SYNC` fica de fora da fileira: é o padrão de todo take, e um chip para "o normal" só
 * gastaria espaço. Tocar de novo no chip marcado devolve o take a `SYNC`.
 */
const NATUREZAS: OptionChip[] = TAKE_KINDS.filter((kind) => kind !== 'SYNC').map(
  (kind) => ({ valor: kind, rotulo: TAKE_KIND_LABEL[kind] }),
);

interface TakeSomProps {
  take: LocalTake;
  dados?: LocalSoundTakeData;
  tracks: LocalSoundTakeTrack[];
  productionId: string;
  shootingDayId: string;
  setupId: string;
  canEdit: boolean;
}

/**
 * O take, do ponto de vista do Som.
 *
 * A restrição que manda nesta tela está em sound.md: o mixer preenche **durante** a
 * gravação, muitas vezes com uma mão e olhando para o gravador. Por isso o julgamento é a
 * primeira coisa do cartão e custa **um toque**; roll, arquivo e canais chegam herdados do
 * take anterior; e natureza, timecode e canais ficam dobrados — quem precisa abre, quem
 * não precisa nem vê.
 */
export function TakeSom({
  take,
  dados,
  tracks,
  productionId,
  shootingDayId,
  setupId,
  canEdit,
}: TakeSomProps) {
  const mos = take.kind === 'MOS';

  /**
   * Garante a linha de som **e os canais** antes de escrever.
   *
   * Preguiçoso de propósito: o take costuma ser criado pela Câmera, e materializar dados
   * de som para todo take de toda diária encheria a fila de sync de registros vazios. O
   * primeiro toque do mixer é o momento em que o Som passa a ter o que dizer sobre o take.
   */
  async function comDados(): Promise<string> {
    const id = await ensureSoundTakeData({
      productionId,
      setupId,
      takeId: take.id,
      takeNumber: take.number,
      shootingDayId,
    });
    await ensureSoundTracks({
      productionId,
      shootingDayId,
      setupId,
      takeId: take.id,
    });
    return id;
  }

  async function altera(changes: Record<string, unknown>) {
    await patchSoundTakeData(await comDados(), changes);
    syncNow();
  }

  /**
   * Um toque marca o julgamento e grava.
   *
   * `circled` acompanha o status em vez de ser um segundo controle: são o mesmo fato dito
   * duas vezes no modelo, e deixá-los divergir daria um relatório em que o take é `CIRCLE`
   * na coluna de status e "não" na de circled. O julgamento do Som é **independente** do da
   * Câmera (ADR-010) — nada aqui toca em `take.status`.
   */
  async function alteraJulgamento(valor: string | null) {
    await altera({ status: valor, circled: valor === 'CIRCLE' });
  }

  /** A natureza é do take compartilhado: marcá-la aqui responde a Câmera e Continuidade. */
  async function alteraNatureza(valor: string | null) {
    await patchEntity('take', take.id, { kind: valor ?? 'SYNC' });
    syncNow();
  }

  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition',
        dados?.circled ? 'border-approved/50 bg-approved-soft' : 'border-line bg-surface',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-zinc-100">Take {take.number}</span>
        {mos ? <Badge tone="warning">MOS</Badge> : null}
        {dados?.soundRoll ? (
          <span className="font-mono text-xs text-zinc-500">Roll {dados.soundRoll}</span>
        ) : null}
        {take._dirty || dados?._dirty ? <Badge tone="muted">não enviado</Badge> : null}
        <span className="flex-1" />
        {canEdit ? (
          <IconButton
            label={`Remover take ${take.number}`}
            variant="danger"
            icon={<TrashIcon size={16} />}
            onClick={() => void softDelete('take', take.id).then(syncNow)}
          />
        ) : null}
      </div>

      {/* O gesto de um toque. Primeiro no cartão porque é o único que acontece com o
          gravador rodando — tudo mais é preenchido depois, ou já veio herdado. */}
      <OptionChips
        label="Julgamento do som"
        className="mt-3"
        options={JULGAMENTOS}
        value={dados?.status ?? null}
        disabled={!canEdit}
        onChange={(valor) => void alteraJulgamento(valor)}
      />

      {dados?.status === 'NG' ? (
        <div className="mt-3">
          <DebouncedTextField
            label="Motivo do NG"
            value={dados?.ngReason ?? ''}
            disabled={!canEdit}
            placeholder="Avião"
            onCommit={(valor) => void altera({ ngReason: valor || null })}
          />
        </div>
      ) : null}

      <Dobra
        titulo="Natureza"
        resumo={mos || take.kind !== 'SYNC' ? rotuloDaNaturezaCurto(take.kind) : ''}
        destaque={mos}
      >
        <OptionChips
          label="Natureza do take"
          className="flex-wrap"
          options={NATUREZAS}
          value={take.kind && take.kind !== 'SYNC' ? take.kind : null}
          disabled={!canEdit}
          onChange={(valor) => void alteraNatureza(valor)}
        />
        <p className="mt-2 text-xs text-zinc-500">
          Vale para os três departamentos: um take MOS é MOS para todo mundo, e é isso que
          a montagem procura quando abre a diária atrás do áudio que não existe.
        </p>
      </Dobra>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <DebouncedTextField
          label="Sound roll"
          value={dados?.soundRoll ?? ''}
          disabled={!canEdit}
          placeholder="004"
          onCommit={(valor) => void altera({ soundRoll: valor || null })}
        />
        <DebouncedTextField
          label="Arquivo"
          value={dados?.fileName ?? ''}
          disabled={!canEdit}
          placeholder="004_012"
          onCommit={(valor) => void altera({ fileName: valor || null })}
        />
      </div>

      <Dobra
        titulo="Timecode"
        resumo={[dados?.tcStart, dados?.tcEnd].filter(Boolean).join(' → ')}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <DebouncedTextField
            label="TC início"
            value={dados?.tcStart ?? ''}
            disabled={!canEdit}
            placeholder="14:32:10:12"
            inputMode="numeric"
            onCommit={(valor) => void altera({ tcStart: valor || null })}
          />
          <DebouncedTextField
            label="TC fim"
            value={dados?.tcEnd ?? ''}
            disabled={!canEdit}
            placeholder="14:33:02:04"
            inputMode="numeric"
            onCommit={(valor) => void altera({ tcEnd: valor || null })}
          />
        </div>
      </Dobra>

      <Dobra
        titulo="Canais"
        resumo={resumoDeTracks(
          tracks.map((track) => ({
            index: track.index,
            nome: track.name ?? '',
            fonte: track.source ?? '',
          })),
        )}
      >
        <TracksDoTake
          tracks={tracks}
          productionId={productionId}
          takeId={take.id}
          canEdit={canEdit}
          onAntesDeEscrever={comDados}
        />
      </Dobra>

      <div className="mt-3">
        <DebouncedTextField
          label="Observações"
          value={dados?.notes ?? ''}
          disabled={!canEdit}
          placeholder="Avião durante o take"
          onCommit={(valor) => void altera({ notes: valor || null })}
        />
      </div>
    </div>
  );
}

function rotuloDaNaturezaCurto(kind: string | null | undefined): string {
  const valor = String(kind ?? '').trim();
  if (!valor || valor === 'SYNC') return '';
  return TAKE_KIND_LABEL[valor as keyof typeof TAKE_KIND_LABEL] ?? valor;
}

/**
 * Uma seção dobrada dentro do cartão, com o resumo no próprio rótulo.
 *
 * O mesmo gesto de "Mídia" no cartão de take da Câmera. O teto de toques por take é
 * critério de conclusão do módulo, e um cartão com tudo aberto o estoura antes do
 * primeiro plano.
 */
function Dobra({
  titulo,
  resumo,
  destaque,
  children,
}: {
  titulo: string;
  resumo?: string;
  destaque?: boolean;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((valor) => !valor)}
        className="flex min-h-[32px] w-full items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300"
      >
        <ChevronDownIcon size={14} className={cn('transition', aberto && 'rotate-180')} />
        {titulo}
        {resumo ? (
          <span
            className={cn('font-mono', destaque ? 'text-amber-400' : 'text-zinc-400')}
          >
            {resumo}
          </span>
        ) : null}
      </button>

      {aberto ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

/**
 * Os canais do take.
 *
 * Chegam herdados do take anterior (`ensureSoundTracks`); editar aqui é para quando algo
 * mudou de verdade — personagem saiu de cena, lav caiu. O que for digitado agora é o que o
 * **próximo** take vai herdar, e é assim que o layout do dia se propaga sem template.
 */
function TracksDoTake({
  tracks,
  productionId,
  takeId,
  canEdit,
  onAntesDeEscrever,
}: {
  tracks: LocalSoundTakeTrack[];
  productionId: string;
  takeId: string;
  canEdit: boolean;
  onAntesDeEscrever: () => Promise<string>;
}) {
  return (
    <div className="flex flex-col gap-2">
      {tracks.length === 0 ? (
        <p className="text-xs text-zinc-500">
          Nenhum canal ainda. O primeiro que você cadastrar é herdado por todos os takes
          seguintes.
        </p>
      ) : null}

      {tracks.map((track) => (
        <div key={track.id} className="flex items-end gap-2">
          <span className="w-6 shrink-0 pb-3 text-center font-mono text-sm text-brand">
            {track.index}
          </span>
          <DebouncedTextField
            label="Canal"
            className="flex-1"
            value={track.name ?? ''}
            disabled={!canEdit}
            placeholder="Boom"
            onCommit={(valor) =>
              void patchSoundTrack(track.id, { name: valor || null }).then(syncNow)
            }
          />
          <DebouncedTextField
            label="Fonte"
            className="flex-1"
            value={track.source ?? ''}
            disabled={!canEdit}
            placeholder="MKH 416"
            onCommit={(valor) =>
              void patchSoundTrack(track.id, { source: valor || null }).then(syncNow)
            }
          />
          {canEdit ? (
            <IconButton
              label={`Remover canal ${track.index}`}
              variant="danger"
              className="mb-0.5"
              icon={<TrashIcon size={16} />}
              onClick={() => void removeSoundTrack(track.id).then(syncNow)}
            />
          ) : null}
        </div>
      ))}

      {canEdit ? (
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<PlusIcon size={15} />}
          onClick={async () => {
            await onAntesDeEscrever();
            await createSoundTrack({
              productionId,
              takeId,
              index: proximoIndiceDeTrack(tracks),
            });
            syncNow();
          }}
        >
          Adicionar canal
        </Button>
      ) : null}
    </div>
  );
}
