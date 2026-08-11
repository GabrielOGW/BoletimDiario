'use client';

import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { CheckCircleIcon, TrashIcon } from '@/components/ui/icons';
import { TextField } from '@/components/ui/TextField';
import { IconButton } from '@/components/ui/IconButton';
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
    await altera({ status: dados?.status === valor ? null : valor });
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
        <CampoComDebounce
          label="Cartão"
          value={dados?.card ?? ''}
          disabled={!canEdit}
          placeholder="A012"
          onCommit={(valor) => void altera({ card: valor || null })}
        />
        <CampoComDebounce
          label="Clip / Sync"
          value={dados?.fileName ?? ''}
          disabled={!canEdit}
          placeholder="A012C005_001"
          onCommit={(valor) => void altera({ fileName: valor || null })}
        />
      </div>

      <div className="mt-3">
        <CampoComDebounce
          label="Nota operacional"
          value={dados?.notes ?? ''}
          disabled={!canEdit}
          placeholder="Foco escapou no meio"
          onCommit={(valor) => void altera({ notes: valor || null })}
        />
      </div>

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
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-zinc-500">Câmera:</span>
          {JULGAMENTOS.map((julgamento) => (
            <button
              key={julgamento.valor}
              type="button"
              aria-pressed={dados?.status === julgamento.valor}
              onClick={() => void alteraJulgamento(julgamento.valor)}
              className={cn(
                'min-h-[32px] rounded-lg border px-2.5 text-xs font-medium transition',
                dados?.status === julgamento.valor
                  ? 'border-brand/60 bg-brand-soft text-zinc-100'
                  : 'border-line bg-surface-raised text-zinc-400 hover:bg-surface-hover',
              )}
            >
              {julgamento.rotulo}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Só o eixo de **julgamento**, e só os valores que sobrevivem a ADR-029.
 *
 * `WILD`, `ROOM_TONE` e `FALSE_START` mudam de eixo na Fase 6, quando `TakeKind` nasce —
 * pô-los aqui agora seria construir uma fileira para desmanchar daqui a uma fase. Tocar
 * de novo no mesmo botão limpa: em set, desfazer não pode custar um menu.
 */
const JULGAMENTOS: { valor: string; rotulo: string }[] = [
  { valor: 'NG', rotulo: 'NG' },
  { valor: 'PARTIAL', rotulo: 'Parcial' },
];

/**
 * Campo de texto com auto-save de 500 ms e flush no desmonte.
 *
 * É o contrato do `useBoletim`, e é ele que faz o app não ter botão salvar — o
 * comportamento validado em set. A coalescência da fila de sync cuida de o debounce não
 * virar uma dezena de operações.
 */
function CampoComDebounce({
  label,
  value,
  placeholder,
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onCommit: (valor: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendente = useRef<string | null>(null);

  // Valor de fora (pull, outro dispositivo) só entra quando não há edição pendente:
  // sobrescrever o que o dedo está digitando é a pior coisa que uma tela de set faz.
  useEffect(() => {
    if (pendente.current === null) setLocal(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (pendente.current !== null) onCommit(pendente.current);
    };
    // O flush no desmonte precisa do valor mais recente, e não de um efeito por tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <TextField
      label={label}
      value={local}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(valor) => {
        setLocal(valor);
        pendente.current = valor;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          onCommit(valor);
          pendente.current = null;
        }, 500);
      }}
    />
  );
}
