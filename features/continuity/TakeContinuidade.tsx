'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { DebouncedTextField } from '@/components/ui/DebouncedTextField';
import { IconButton } from '@/components/ui/IconButton';
import { OptionChips } from '@/components/ui/OptionChips';
import { ChevronDownIcon, TrashIcon } from '@/components/ui/icons';
import type {
  LocalCameraTakeData,
  LocalContinuityTakeData,
  LocalSoundTakeData,
  LocalTake,
} from '@/lib/offline/db';
import { softDelete } from '@/lib/offline/repos/diaria';
import {
  ensureContinuityTakeData,
  patchContinuityTakeData,
} from '@/lib/offline/repos/continuidade';
import { syncNow } from '@/lib/sync/engine';
import { cn } from '@/utils/cn';

import { EstadoDoTake } from './EstadoDoSet';
import {
  CAMPOS_DE_ACAO,
  VEREDITOS,
  camposPreenchidos,
  duracaoEmSegundos,
  segundosEmDuracao,
} from './estrutura';

interface TakeContinuidadeProps {
  take: LocalTake;
  dados?: LocalContinuityTakeData;
  /** Lente e T-stop do mesmo take, lidos de Câmera — nunca redigitados aqui (§2). */
  camera?: LocalCameraTakeData;
  som?: LocalSoundTakeData;
  productionId: string;
  sceneId: string;
  setupId: string;
  canEdit: boolean;
}

/**
 * O take, do ponto de vista da Continuidade.
 *
 * O módulo com o maior volume de dados por take, e é justamente por isso que a tela mostra
 * **status, notas e o que já tem valor** — o resto fica atrás de "mais campos" (§3).
 * Preenchimento típico em set usa dois ou três desses catorze campos, e um formulário de
 * sessenta linhas aberto por take é a forma mais rápida de fazer alguém voltar ao caderno.
 *
 * O cabeçalho técnico vem dos outros departamentos (§34): lente, T-stop, roll e arquivo
 * aparecem porque os três apontam para o mesmo `take_id`. A continuísta lê o que a câmera
 * registrou em vez de copiar — e copiar é onde o erro acontece.
 */
export function TakeContinuidade({
  take,
  dados,
  camera,
  som,
  productionId,
  sceneId,
  setupId,
  canEdit,
}: TakeContinuidadeProps) {
  const print = dados?.selected ?? false;

  /** Garante a linha antes de escrever. Preguiçoso: o take costuma vir da Câmera. */
  async function comDados(): Promise<string> {
    return ensureContinuityTakeData({ productionId, takeId: take.id });
  }

  async function altera(changes: Record<string, unknown>) {
    await patchContinuityTakeData(await comDados(), changes);
    syncNow();
  }

  /**
   * Um toque decide o veredito.
   *
   * `selected` acompanha o print pelo mesmo motivo do `circled` no Som: são o mesmo fato
   * dito duas vezes no modelo, e deixá-los divergir daria um relatório em que o take está
   * impresso numa coluna e não impresso na outra. O veredito da Continuidade é
   * **independente** do da Câmera e do Som (ADR-010) — nada aqui toca em `take.status`.
   */
  async function alteraVeredito(valor: string | null) {
    await altera({ status: valor, selected: valor === 'CIRCLE' });
  }

  const tecnica = [camera?.lens, camera?.tStop].filter(Boolean).join(' ');
  const audio = [som?.soundRoll ? `Roll ${som.soundRoll}` : '', som?.fileName]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition',
        print ? 'border-approved/50 bg-approved-soft' : 'border-line bg-surface',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-zinc-100">Take {take.number}</span>
        {take.kind && take.kind !== 'SYNC' ? (
          <Badge tone="warning">{take.kind === 'MOS' ? 'MOS' : take.kind}</Badge>
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

      {/* Lido dos outros departamentos, nunca digitado aqui. Some quando não há o que
          mostrar: uma linha "— · —" só ocuparia espaço no alto do cartão. */}
      {tecnica || audio ? (
        <p className="mt-1 font-mono text-xs text-zinc-400">
          {[tecnica, audio].filter(Boolean).join('  ·  ')}
        </p>
      ) : null}

      <OptionChips
        label="Veredito da continuidade"
        className="mt-3"
        options={VEREDITOS}
        value={dados?.status ?? null}
        disabled={!canEdit}
        onChange={(valor) => void alteraVeredito(valor)}
      />

      {dados?.status === 'NG' ? (
        <div className="mt-3">
          <DebouncedTextField
            label="Motivo do NG"
            value={dados?.ngReason ?? ''}
            disabled={!canEdit}
            placeholder="Ator errou a marca"
            onCommit={(valor) => void altera({ ngReason: valor || null })}
          />
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-[8rem_1fr]">
        <DebouncedTextField
          label="Duração"
          value={segundosEmDuracao(dados?.durationSec)}
          disabled={!canEdit}
          placeholder="00:42"
          inputMode="numeric"
          onCommit={(valor) => void altera({ durationSec: duracaoEmSegundos(valor) })}
        />
        <DebouncedTextField
          label="Observações"
          value={dados?.notes ?? ''}
          disabled={!canEdit}
          placeholder="João pega o copo com a mão direita"
          onCommit={(valor) => void altera({ notes: valor || null })}
        />
      </div>

      <MaisCampos dados={dados} canEdit={canEdit} onAltera={altera} />

      <EstadoDoTake
        productionId={productionId}
        sceneId={sceneId}
        setupId={setupId}
        takeId={take.id}
        canEdit={canEdit}
      />
    </div>
  );
}

/**
 * Os catorze campos de ação — fechados, com os preenchidos à mostra (§3).
 *
 * "Mostra apenas o que já tem valor" não é economia de pixel: é o que faz o cartão do take
 * 7 lembrar sozinho o que foi anotado no take 6 sem obrigar ninguém a abrir nada.
 */
function MaisCampos({
  dados,
  canEdit,
  onAltera,
}: {
  dados?: LocalContinuityTakeData;
  canEdit: boolean;
  onAltera: (changes: Record<string, unknown>) => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const preenchidos = camposPreenchidos(dados);

  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((valor) => !valor)}
        className="flex min-h-[32px] w-full items-center gap-2 text-xs text-zinc-400 hover:text-zinc-300"
      >
        <ChevronDownIcon size={14} className={cn('transition', aberto && 'rotate-180')} />
        Mais campos
        {!aberto && preenchidos.length > 0 ? (
          <span className="text-zinc-400">{preenchidos.length} preenchido(s)</span>
        ) : null}
      </button>

      {!aberto && preenchidos.length > 0 ? (
        <dl className="mt-1.5 flex flex-col gap-1 text-xs">
          {preenchidos.map((campo) => (
            <div key={campo.rotulo} className="flex gap-2">
              <dt className="shrink-0 text-zinc-400">{campo.rotulo}:</dt>
              <dd className="min-w-0 flex-1 truncate text-zinc-300">{campo.valor}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {aberto ? (
        <div className="mt-2 flex flex-col gap-4">
          {CAMPOS_DE_ACAO.map((grupo) => (
            <div key={grupo.grupo} className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {grupo.grupo}
              </p>
              {grupo.campos.map((campo) => (
                <DebouncedTextField
                  key={String(campo.campo)}
                  label={campo.rotulo}
                  value={String(dados?.[campo.campo] ?? '')}
                  disabled={!canEdit}
                  placeholder={campo.exemplo}
                  onCommit={(valor) => void onAltera({ [campo.campo]: valor || null })}
                />
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
