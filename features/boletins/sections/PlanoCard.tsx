'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Plano, Take } from '@/types/boletim';
import { TextField } from '@/components/ui/TextField';
import { TextAreaField } from '@/components/ui/TextAreaField';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Badge } from '@/components/ui/Badge';
import { TakeRow } from '@/features/boletins/sections/TakeRow';
import { CameraPicker } from '@/features/boletins/sections/CameraPicker';
import { createTake } from '@/lib/factory';
import { useEditorMeta } from '@/hooks/useSuggestions';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CopyIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/ui/icons';
import { cn } from '@/utils/cn';

interface PlanoCardProps {
  plano: Plano;
  index: number;
  total: number;
  onChange: (next: Plano) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h5 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h5>
      {children}
    </div>
  );
}

function isEmptyPlano(plano: Plano): boolean {
  return (
    plano.takes.length === 0 &&
    !plano.tecnica.formatoGravacao &&
    !plano.tecnica.resolucao &&
    !plano.optica.lentes &&
    !plano.cameraNome &&
    !plano.cameraId
  );
}

export function PlanoCard({
  plano,
  index,
  total,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
}: PlanoCardProps) {
  const { cameras, suggestions } = useEditorMeta();
  const [open, setOpen] = useState(() => isEmptyPlano(plano));

  const approvedCount = plano.takes.filter((take) => take.aprovado).length;
  const cameraLabel =
    cameras.find((cam) => cam.id === plano.cameraId)?.nomeId || plano.cameraNome;
  const showTipo = plano.tipo && plano.tipo !== 'Normal';

  const patch = (value: Partial<Plano>) => onChange({ ...plano, ...value });
  const patchTecnica = (value: Partial<Plano['tecnica']>) =>
    onChange({ ...plano, tecnica: { ...plano.tecnica, ...value } });
  const patchOptica = (value: Partial<Plano['optica']>) =>
    onChange({ ...plano, optica: { ...plano.optica, ...value } });

  const addTake = () =>
    onChange({
      ...plano,
      takes: [...plano.takes, createTake(String(plano.takes.length + 1))],
    });
  const updateTake = (id: string, value: Partial<Take>) =>
    onChange({
      ...plano,
      takes: plano.takes.map((take) => (take.id === id ? { ...take, ...value } : take)),
    });
  const removeTake = (id: string) =>
    onChange({ ...plano, takes: plano.takes.filter((take) => take.id !== id) });

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface-raised">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-surface-hover"
      >
        <ChevronDownIcon
          size={18}
          className={cn('shrink-0 text-zinc-400 transition', open && 'rotate-180')}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Plano
            </span>
            <span className="truncate text-sm font-semibold text-white">
              {plano.numero.trim() || 'sem número'}
            </span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {showTipo ? <Badge tone="brand">{plano.tipo}</Badge> : null}
            {cameraLabel ? <Badge tone="muted">{cameraLabel}</Badge> : null}
            <Badge tone="neutral">
              {plano.takes.length} {plano.takes.length === 1 ? 'take' : 'takes'}
            </Badge>
            {approvedCount > 0 ? (
              <Badge tone="approved">
                <CheckCircleIcon size={12} />
                {approvedCount}
              </Badge>
            ) : null}
          </span>
        </span>
      </button>

      {open ? (
        <div className="space-y-4 border-t border-line p-3.5">
          <div className="flex items-center gap-2">
            <IconButton
              label="Mover plano para cima"
              variant="surface"
              icon={<ArrowUpIcon size={18} />}
              disabled={index === 0}
              onClick={() => onMove(-1)}
            />
            <IconButton
              label="Mover plano para baixo"
              variant="surface"
              icon={<ArrowDownIcon size={18} />}
              disabled={index === total - 1}
              onClick={() => onMove(1)}
            />
            <div className="flex-1" />
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<CopyIcon size={16} />}
              onClick={onDuplicate}
            >
              Duplicar
            </Button>
            <IconButton
              label="Excluir plano"
              variant="danger"
              icon={<TrashIcon size={20} />}
              onClick={onRemove}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Plano nº"
              value={plano.numero}
              onChange={(v) => patch({ numero: v })}
              placeholder="Ex.: 1"
            />
            <TextField
              label="Tipo / Captação"
              value={plano.tipo}
              onChange={(v) => patch({ tipo: v })}
              options={suggestions.tipoPlano}
            />
          </div>

          <CameraPicker
            cameraId={plano.cameraId}
            cameraNome={plano.cameraNome}
            onChange={(value) => patch(value)}
          />

          <Group title="Configurações técnicas">
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Formato de gravação"
                value={plano.tecnica.formatoGravacao}
                onChange={(v) => patchTecnica({ formatoGravacao: v })}
                options={suggestions.formatoGravacao}
                className="col-span-2"
              />
              <TextField
                label="Resolução"
                value={plano.tecnica.resolucao}
                onChange={(v) => patchTecnica({ resolucao: v })}
                options={suggestions.resolucao}
              />
              <TextField
                label="Frame rate"
                value={plano.tecnica.frameRate}
                onChange={(v) => patchTecnica({ frameRate: v })}
                options={suggestions.frameRate}
                inputMode="decimal"
              />
              <TextField
                label="ISO / ASA"
                value={plano.tecnica.iso}
                onChange={(v) => patchTecnica({ iso: v })}
                options={suggestions.iso}
                inputMode="numeric"
              />
              <TextField
                label="Obturador"
                value={plano.tecnica.obturador}
                onChange={(v) => patchTecnica({ obturador: v })}
                options={suggestions.obturador}
                inputMode="decimal"
              />
              <TextField
                label="Balanço de branco"
                value={plano.tecnica.balancoBranco}
                onChange={(v) => patchTecnica({ balancoBranco: v })}
                options={suggestions.balancoBranco}
              />
              <TextField
                label="LUT / Perfil"
                value={plano.tecnica.lutPerfil}
                onChange={(v) => patchTecnica({ lutPerfil: v })}
                options={suggestions.lutPerfil}
              />
              <TextField
                label="Espaço de cor"
                value={plano.tecnica.espacoCor}
                onChange={(v) => patchTecnica({ espacoCor: v })}
                options={suggestions.espacoCor}
              />
              <TextField
                label="Diafragma"
                value={plano.tecnica.diafragma}
                onChange={(v) => patchTecnica({ diafragma: v })}
                options={suggestions.diafragma}
              />
            </div>
          </Group>

          <Group title="Óptica">
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Lente(s)"
                value={plano.optica.lentes}
                onChange={(v) => patchOptica({ lentes: v })}
                options={suggestions.lentes}
              />
              <TextField
                label="Filtros"
                value={plano.optica.filtros}
                onChange={(v) => patchOptica({ filtros: v })}
                options={suggestions.filtros}
              />
              <Toggle
                label="Matte Box"
                checked={plano.optica.matteBox}
                onChange={(checked) => patchOptica({ matteBox: checked })}
                className="col-span-2"
              />
            </div>
          </Group>

          <TextAreaField
            label="Observações do plano"
            value={plano.observacoes}
            onChange={(v) => patch({ observacoes: v })}
            placeholder="Notas do plano…"
          />

          <Group title="Takes">
            {plano.takes.length === 0 ? (
              <p className="mb-3 text-sm text-zinc-500">
                Nenhum take. Adicione e marque os aprovados pelo diretor.
              </p>
            ) : (
              <ul className="mb-3 flex flex-col gap-2.5">
                {plano.takes.map((take) => (
                  <TakeRow
                    key={take.id}
                    take={take}
                    onChange={(value) => updateTake(take.id, value)}
                    onRemove={() => removeTake(take.id)}
                  />
                ))}
              </ul>
            )}
            <Button
              variant="primary"
              fullWidth
              leftIcon={<PlusIcon size={18} />}
              onClick={addTake}
            >
              Adicionar take
            </Button>
          </Group>
        </div>
      ) : null}
    </div>
  );
}
