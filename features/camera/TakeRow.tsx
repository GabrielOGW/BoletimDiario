'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { CheckCircleIcon, ChevronDownIcon, TrashIcon } from '@/components/ui/icons';
import { DebouncedTextField } from '@/components/ui/DebouncedTextField';
import { IconButton } from '@/components/ui/IconButton';
import { OptionChips, type OptionChip } from '@/components/ui/OptionChips';
import type { LocalCameraTakeData, LocalTake } from '@/lib/offline/db';
import { ensureCameraTakeData, patchCameraTakeData } from '@/lib/offline/repos/camera';
import { patchEntity, softDelete } from '@/lib/offline/repos/diaria';
import { syncNow } from '@/lib/sync/engine';
import { cn } from '@/utils/cn';

/**
 * A linha do take — cartão, clip/sync, nota operacional e o toggle verde.
 *
 * **O toggle "Aprovado pelo diretor" continua exatamente como está** (ADR-010 e
 * ADR-030). Trocá-lo por um seletor de status seria regressão em nome de pureza de
 * modelo: em set, aprovar é um gesto de um dedo.
 */
export function TakeRow({
  take,
  dados,
  productionId,
  setupId,
  cameraUnitId,
  canEdit,
}: {
  take: LocalTake;
  dados?: LocalCameraTakeData;
  productionId: string;
  setupId: string;
  cameraUnitId: string | null;
  canEdit: boolean;
}) {
  const aprovado = dados?.approved ?? false;

  /** Garante a linha de câmera antes de escrever nela. Idempotente pelo id derivado. */
  async function comDados(): Promise<string> {
    return ensureCameraTakeData({
      productionId,
      setupId,
      takeId: take.id,
      takeNumber: take.number,
      cameraUnitId,
    });
  }

  async function altera(changes: Record<string, unknown>) {
    await patchCameraTakeData(await comDados(), changes);
    syncNow();
  }

  /**
   * Aprovar é **um** gesto e escreve nos dois lugares que ADR-010 exige.
   *
   * `approved` guarda a semântica "aprovado pelo diretor", que o boletim sempre teve, e
   * `take.status = CIRCLE` é o mesmo fato dito no vocabulário compartilhado — é o que o
   * Som e a Continuidade leem, e é exatamente o que a importação dos boletins locais já
   * produzia. Escrever só um dos dois faria a diária digitada aqui divergir da importada.
   */
  async function alternaAprovacao() {
    const proximo = !aprovado;
    await patchCameraTakeData(await comDados(), { approved: proximo });

    // Só volta para `RECORDED` o que este toggle marcou: um take que alguém pôs em outro
    // status por outro caminho não é rebaixado por uma desaprovação.
    if (proximo || take.status === 'CIRCLE') {
      await patchEntity('take', take.id, {
        status: proximo ? 'CIRCLE' : 'RECORDED',
      });
    }

    syncNow();
  }

  /** O julgamento **da câmera**, separado da aprovação do diretor (ADR-010). */
  async function alteraJulgamento(valor: string | null) {
    await altera({ status: valor });
  }

  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition',
        aprovado ? 'border-approved/50 bg-approved-soft' : 'border-line bg-surface',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-zinc-100">Take {take.number}</span>
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

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <DebouncedTextField
          label="Cartão"
          value={dados?.card ?? ''}
          disabled={!canEdit}
          placeholder="A012"
          onCommit={(valor) => void altera({ card: valor || null })}
        />
        <DebouncedTextField
          label="Clip / Sync"
          value={dados?.fileName ?? ''}
          disabled={!canEdit}
          placeholder="A012C005_001"
          onCommit={(valor) => void altera({ fileName: valor || null })}
        />
      </div>

      <div className="mt-3">
        <DebouncedTextField
          label="Nota operacional"
          value={dados?.notes ?? ''}
          disabled={!canEdit}
          placeholder="Foco escapou no meio"
          onCommit={(valor) => void altera({ notes: valor || null })}
        />
      </div>

      {/* Roll, volume e observações de mídia ficam **fechados**. Eles pertencem ao take,
          mas quase nunca mudam de um para o outro — herdam do anterior — e o teto de
          toques por take é critério de conclusão do módulo, não recomendação. Quem
          precisa deles abre uma vez; quem não precisa nem os vê. */}
      <MidiaDoTake dados={dados} canEdit={canEdit} onAltera={altera} />

      <button
        type="button"
        role="switch"
        aria-checked={aprovado}
        disabled={!canEdit}
        onClick={() => void alternaAprovacao()}
        className={cn(
          'mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition',
          aprovado
            ? 'border-approved/60 bg-approved/15 text-approved'
            : 'border-line bg-surface-raised text-zinc-300 hover:bg-surface-hover',
          !canEdit && 'cursor-not-allowed opacity-60',
        )}
      >
        <CheckCircleIcon size={18} />
        {aprovado ? 'Aprovado pelo diretor' : 'Marcar como aprovado'}
      </button>

      {/* O julgamento da câmera, ao lado e menor — nunca no lugar do toggle (ADR-010,
          ADR-029). É opcional: o take normal não precisa de nenhum toque aqui. */}
      {canEdit ? (
        <OptionChips
          label="Câmera"
          showLabel
          size="sm"
          className="mt-2"
          options={JULGAMENTOS}
          value={dados?.status ?? null}
          onChange={(valor) => void alteraJulgamento(valor)}
        />
      ) : null}
    </div>
  );
}

/**
 * Só o eixo de **julgamento** (ADR-029).
 *
 * `WILD`, `ROOM_TONE` e `FALSE_START` mudaram de eixo na Fase 6 e viraram `Take.kind`:
 * quem os marca é o cartão de natureza, no módulo de Som, e o valor vale para os três
 * departamentos. Tocar de novo no mesmo botão limpa — em set, desfazer não pode custar um
 * menu, e isso agora é comportamento do `OptionChips`.
 */
const JULGAMENTOS: OptionChip[] = [
  { valor: 'NG', rotulo: 'NG' },
  { valor: 'PARTIAL', rotulo: 'Parcial' },
];

/**
 * Roll, volume e observações de mídia — os campos que o modelo novo trouxe (§3).
 *
 * Fechado por padrão, e o rótulo já resume o que há dentro: quem tem roll preenchido vê
 * "R01" no cabeçalho sem abrir.
 */
function MidiaDoTake({
  dados,
  canEdit,
  onAltera,
}: {
  dados?: LocalCameraTakeData;
  canEdit: boolean;
  onAltera: (changes: Record<string, unknown>) => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);

  const resumo = [dados?.roll, dados?.volume].filter(Boolean).join(' · ');

  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((valor) => !valor)}
        className="flex min-h-[32px] w-full items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300"
      >
        <ChevronDownIcon size={14} className={cn('transition', aberto && 'rotate-180')} />
        Mídia
        {resumo ? <span className="font-mono text-zinc-400">{resumo}</span> : null}
      </button>

      {aberto ? (
        <div className="mt-2 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <DebouncedTextField
              label="Roll"
              value={dados?.roll ?? ''}
              disabled={!canEdit}
              placeholder="R01"
              onCommit={(valor) => void onAltera({ roll: valor || null })}
            />
            <DebouncedTextField
              label="Volume"
              value={dados?.volume ?? ''}
              disabled={!canEdit}
              placeholder="VOL_A"
              onCommit={(valor) => void onAltera({ volume: valor || null })}
            />
          </div>
          <DebouncedTextField
            label="Observações de mídia"
            value={dados?.mediaNotes ?? ''}
            disabled={!canEdit}
            placeholder="Cartão devolvido ao DIT às 14h"
            onCommit={(valor) => void onAltera({ mediaNotes: valor || null })}
          />
        </div>
      ) : null}
    </div>
  );
}
