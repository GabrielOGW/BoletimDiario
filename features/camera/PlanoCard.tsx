'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { ChevronDownIcon, PlusIcon } from '@/components/ui/icons';
import type {
  LocalCameraTakeData,
  LocalCameraUnit,
  LocalSetup,
  LocalTake,
} from '@/lib/offline/db';
import {
  cameraTakeDataId,
  ensureCameraTakeData,
  patchPlanoTecnica,
  planoTecnica,
} from '@/lib/offline/repos/camera';
import { createTake, nextTakeNumber, patchEntity } from '@/lib/offline/repos/diaria';
import { syncNow } from '@/lib/sync/engine';
import { cn } from '@/utils/cn';

import { TakeRow } from './TakeRow';

/** Os mesmos campos técnicos do cartão de Plano do boletim, na mesma ordem. */
const TECNICA: { field: string; label: string; placeholder?: string }[] = [
  { field: 'codec', label: 'Formato de gravação', placeholder: 'ProRes 4444' },
  { field: 'resolution', label: 'Resolução', placeholder: '4.6K' },
  { field: 'aspectRatio', label: 'Aspect ratio', placeholder: '2.39:1' },
  { field: 'fps', label: 'Frame rate', placeholder: '24' },
  { field: 'iso', label: 'ISO / ASA', placeholder: '800' },
  { field: 'shutter', label: 'Obturador', placeholder: '180°' },
  { field: 'whiteBalance', label: 'Balanço de branco', placeholder: '5600K' },
  { field: 'lut', label: 'LUT / Perfil', placeholder: 'Rec709' },
  { field: 'colorSpace', label: 'Espaço de cor', placeholder: 'LogC4' },
  { field: 'tStop', label: 'Diafragma', placeholder: 'T2.8' },
];

const OPTICA: { field: string; label: string; placeholder?: string }[] = [
  { field: 'lens', label: 'Lente(s)', placeholder: 'Cooke S8/i 32mm' },
  { field: 'focalLength', label: 'Focal', placeholder: '32mm' },
  { field: 'filter', label: 'Filtros', placeholder: 'ND 0.6' },
];

/**
 * VFX fica sozinho e por último.
 *
 * Não é configuração de captação: é um recado para a pós ("tracking markers", "green
 * screen"). Misturá-lo entre ISO e obturador faria o olho de quem preenche em set
 * atravessar um campo que quase nunca muda.
 */
const VFX = {
  field: 'vfx',
  label: 'VFX / nota para a pós',
  placeholder: 'Marcadores no chão',
};

/** O único campo técnico que não é texto — e o boletim sempre teve (`optica.matteBox`). */
const MATTE_BOX = 'matteBox';

/** Os mesmos de `PRESETS.tipoPlano` do boletim. São sugestão, não lista fechada. */
const TIPOS_DE_PLANO = ['Normal', 'Série', 'Insert', 'Pickup', 'Drone'];

/**
 * O cartão de Plano.
 *
 * Os campos técnicos aparecem **aqui**, como no boletim, mas o valor mora nos takes
 * (ADR-011). Editar um deles acompanha todos os takes que ainda tinham o valor antigo e
 * não toca no take que alguém ajustou à mão — é o que a pessoa espera de "mudei o ISO do
 * plano". A regra está em `patchPlanoTecnica`, não aqui.
 */
export function PlanoCard({
  setup,
  takes,
  dadosCamera,
  cameras,
  productionId,
  canEdit,
}: {
  setup: LocalSetup;
  takes: LocalTake[];
  dadosCamera: LocalCameraTakeData[];
  cameras: LocalCameraUnit[];
  productionId: string;
  canEdit: boolean;
}) {
  const [aberto, setAberto] = useState(true);

  /**
   * A câmera do plano. Guardada em `setup.name` por ora — o modelo não tem coluna de
   * câmera no setup, e criar uma para isso significaria migração no meio da fase. O
   * vínculo real está em cada `cameraTakeData`, que é onde ele importa.
   */
  const cameraUnitId = setup.name ?? null;

  const tecnica: Record<string, unknown> =
    useLiveQuery(
      () => planoTecnica(setup.id, cameraUnitId),
      [setup.id, cameraUnitId, takes.length],
      {} as Record<string, unknown>,
    ) ?? {};

  const aprovados = dadosCamera.filter(
    (dado) => dado.approved && takes.some((take) => take.id === dado.takeId),
  ).length;

  async function alteraTecnica(field: string, valorNovo: string | boolean) {
    await patchPlanoTecnica({
      setupId: setup.id,
      cameraUnitId,
      field,
      valorAnterior: tecnica[field] ?? null,
      valorNovo: valorNovo || null,
    });
    syncNow();
  }

  async function adicionaTake() {
    const numero = await nextTakeNumber(setup.id);
    const takeId = await createTake({ productionId, setupId: setup.id, number: numero });
    await ensureCameraTakeData({
      productionId,
      setupId: setup.id,
      takeId,
      takeNumber: numero,
      cameraUnitId,
    });
    syncNow();
  }

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface-raised">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((valor) => !valor)}
        className={cn(
          'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-surface-hover',
          aberto && 'border-b border-line',
        )}
      >
        <span className="text-sm font-semibold text-zinc-100">Plano {setup.code}</span>
        {/* "Normal" não vira badge: é o padrão, e um selo em todo plano não informa nada
            — a mesma regra do cartão de plano do boletim. */}
        {setup.kind && setup.kind !== 'Normal' ? (
          <Badge tone="brand">{setup.kind}</Badge>
        ) : null}
        {aprovados > 0 ? <Badge tone="approved">{aprovados}</Badge> : null}
        <span className="flex-1" />
        <span className="truncate text-xs text-zinc-400">
          {[
            tecnica.lens,
            tecnica.tStop,
            tecnica.iso ? `ISO ${String(tecnica.iso)}` : null,
          ]
            .filter(Boolean)
            .join(' · ') || `${takes.length} take(s)`}
        </span>
        <ChevronDownIcon
          size={18}
          className={cn('text-zinc-400 transition', aberto && 'rotate-180')}
        />
      </button>

      {aberto ? (
        <div className="flex flex-col gap-4 p-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Plano nº"
              value={setup.code}
              disabled={!canEdit}
              onChange={(valor) =>
                void patchEntity('setup', setup.id, { code: valor }).then(syncNow)
              }
            />
            <SelectField
              label="Câmera"
              value={cameraUnitId ?? ''}
              disabled={!canEdit}
              options={[
                { value: '', label: 'Sem câmera definida' },
                ...cameras.map((camera) => ({
                  value: camera.id,
                  label: `${camera.label}${camera.model ? ` · ${camera.model}` : ''}`,
                })),
              ]}
              onChange={(valor) =>
                void patchEntity('setup', setup.id, { name: valor || null }).then(syncNow)
              }
            />
          </div>

          {/* Texto livre com sugestões, como no boletim: `tipo` sempre aceitou valor
              digitado ("Dolly de aproximação"), e um seletor fechado viraria perda de
              dado na importação. */}
          <TextField
            label="Tipo / Captação"
            value={setup.kind ?? ''}
            disabled={!canEdit}
            options={TIPOS_DE_PLANO}
            onChange={(valor) =>
              void patchEntity('setup', setup.id, { kind: valor || null }).then(syncNow)
            }
          />

          <div className="grid gap-3 sm:grid-cols-2">
            {TECNICA.map((campo) => (
              <TextField
                key={campo.field}
                label={campo.label}
                placeholder={campo.placeholder}
                value={String(tecnica[campo.field] ?? '')}
                disabled={!canEdit}
                onChange={(valor) => void alteraTecnica(campo.field, valor)}
              />
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {OPTICA.map((campo) => (
              <TextField
                key={campo.field}
                label={campo.label}
                placeholder={campo.placeholder}
                value={String(tecnica[campo.field] ?? '')}
                disabled={!canEdit}
                onChange={(valor) => void alteraTecnica(campo.field, valor)}
              />
            ))}
          </div>

          <label className="flex min-h-[44px] items-center gap-3 text-sm text-zinc-200">
            <input
              type="checkbox"
              checked={Boolean(tecnica[MATTE_BOX])}
              disabled={!canEdit}
              onChange={(evento) => void alteraTecnica(MATTE_BOX, evento.target.checked)}
              className="h-5 w-5 shrink-0 accent-brand"
            />
            Matte Box
          </label>

          <TextField
            label={VFX.label}
            placeholder={VFX.placeholder}
            value={String(tecnica[VFX.field] ?? '')}
            disabled={!canEdit}
            onChange={(valor) => void alteraTecnica(VFX.field, valor)}
          />

          <TextField
            label="Observações do plano"
            value={setup.description ?? ''}
            disabled={!canEdit}
            placeholder="Câmera na mão, contra do ator"
            onChange={(valor) =>
              void patchEntity('setup', setup.id, { description: valor || null }).then(
                syncNow,
              )
            }
          />

          <p className="text-xs leading-relaxed text-zinc-400">
            Mudar um campo técnico aqui acompanha os takes que ainda tinham o valor
            anterior. Um take ajustado individualmente não é alterado.
          </p>

          <div className="flex flex-col gap-2">
            {takes.map((take) => (
              <TakeRow
                key={take.id}
                take={take}
                dados={dadosCamera.find(
                  (dado) => dado.id === cameraTakeDataId(take.id, cameraUnitId),
                )}
                productionId={productionId}
                setupId={setup.id}
                cameraUnitId={cameraUnitId}
                canEdit={canEdit}
              />
            ))}
          </div>

          {canEdit ? (
            <Button
              variant="secondary"
              leftIcon={<PlusIcon size={16} />}
              onClick={() => void adicionaTake()}
            >
              Adicionar take
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
