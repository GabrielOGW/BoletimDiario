'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Cena, Take } from '@/types/boletim';
import { TextField } from '@/components/ui/TextField';
import { TextAreaField } from '@/components/ui/TextAreaField';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Badge } from '@/components/ui/Badge';
import { TakeRow } from '@/features/boletins/sections/TakeRow';
import { PRESETS } from '@/lib/constants';
import { createTake } from '@/lib/factory';
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

interface CenaCardProps {
  cena: Cena;
  index: number;
  total: number;
  onChange: (next: Cena) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h4>
      {children}
    </div>
  );
}

export function CenaCard({
  cena,
  index,
  total,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
}: CenaCardProps) {
  const [open, setOpen] = useState(() => cena.numeroNome.trim() === '');

  const approvedCount = cena.takes.filter((take) => take.aprovado).length;
  const techSummary = [cena.tecnica.resolucao, cena.tecnica.frameRate]
    .filter(Boolean)
    .join(' · ');

  const patch = (value: Partial<Cena>) => onChange({ ...cena, ...value });
  const patchTecnica = (value: Partial<Cena['tecnica']>) =>
    onChange({ ...cena, tecnica: { ...cena.tecnica, ...value } });
  const patchOptica = (value: Partial<Cena['optica']>) =>
    onChange({ ...cena, optica: { ...cena.optica, ...value } });

  const addTake = () =>
    onChange({
      ...cena,
      takes: [...cena.takes, createTake(String(cena.takes.length + 1))],
    });
  const updateTake = (id: string, value: Partial<Take>) =>
    onChange({
      ...cena,
      takes: cena.takes.map((take) => (take.id === id ? { ...take, ...value } : take)),
    });
  const removeTake = (id: string) =>
    onChange({ ...cena, takes: cena.takes.filter((take) => take.id !== id) });

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-surface-hover"
      >
        <ChevronDownIcon
          size={20}
          className={cn('shrink-0 text-zinc-400 transition', open && 'rotate-180')}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className="text-sm font-semibold uppercase tracking-wide text-brand">
              Cena
            </span>
            <span className="truncate text-base font-semibold text-white">
              {cena.numeroNome.trim() || 'sem número'}
            </span>
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">
              {cena.takes.length} {cena.takes.length === 1 ? 'take' : 'takes'}
            </Badge>
            {approvedCount > 0 ? (
              <Badge tone="approved">
                <CheckCircleIcon size={12} />
                {approvedCount} aprovado{approvedCount > 1 ? 's' : ''}
              </Badge>
            ) : null}
            {techSummary ? <Badge tone="muted">{techSummary}</Badge> : null}
            {cena.optica.lentes ? <Badge tone="muted">{cena.optica.lentes}</Badge> : null}
          </span>
        </span>
      </button>

      {open ? (
        <div className="space-y-5 border-t border-line p-4">
          <div className="flex items-center gap-2">
            <IconButton
              label="Mover cena para cima"
              variant="surface"
              icon={<ArrowUpIcon size={18} />}
              disabled={index === 0}
              onClick={() => onMove(-1)}
            />
            <IconButton
              label="Mover cena para baixo"
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
              label="Excluir cena"
              variant="danger"
              icon={<TrashIcon size={18} />}
              onClick={onRemove}
            />
          </div>

          <TextField
            label="Número / Nome da cena"
            value={cena.numeroNome}
            onChange={(v) => patch({ numeroNome: v })}
            placeholder="Ex.: 17.1"
          />

          <Group title="Configurações técnicas">
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Formato de gravação"
                value={cena.tecnica.formatoGravacao}
                onChange={(v) => patchTecnica({ formatoGravacao: v })}
                options={PRESETS.formatoGravacao}
                className="col-span-2"
              />
              <TextField
                label="Resolução"
                value={cena.tecnica.resolucao}
                onChange={(v) => patchTecnica({ resolucao: v })}
                options={PRESETS.resolucao}
              />
              <TextField
                label="Frame rate"
                value={cena.tecnica.frameRate}
                onChange={(v) => patchTecnica({ frameRate: v })}
                options={PRESETS.frameRate}
                inputMode="decimal"
              />
              <TextField
                label="ISO / ASA"
                value={cena.tecnica.iso}
                onChange={(v) => patchTecnica({ iso: v })}
                options={PRESETS.iso}
                inputMode="numeric"
              />
              <TextField
                label="Obturador"
                value={cena.tecnica.obturador}
                onChange={(v) => patchTecnica({ obturador: v })}
                options={PRESETS.obturador}
                inputMode="decimal"
              />
              <TextField
                label="Balanço de branco"
                value={cena.tecnica.balancoBranco}
                onChange={(v) => patchTecnica({ balancoBranco: v })}
                options={PRESETS.balancoBranco}
              />
              <TextField
                label="LUT / Perfil"
                value={cena.tecnica.lutPerfil}
                onChange={(v) => patchTecnica({ lutPerfil: v })}
                options={PRESETS.lutPerfil}
              />
              <TextField
                label="Espaço de cor"
                value={cena.tecnica.espacoCor}
                onChange={(v) => patchTecnica({ espacoCor: v })}
                options={PRESETS.espacoCor}
              />
              <TextField
                label="Diafragma"
                value={cena.tecnica.diafragma}
                onChange={(v) => patchTecnica({ diafragma: v })}
                options={PRESETS.diafragma}
              />
            </div>
          </Group>

          <Group title="Óptica">
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Lente(s)"
                value={cena.optica.lentes}
                onChange={(v) => patchOptica({ lentes: v })}
                options={PRESETS.lentes}
              />
              <TextField
                label="Filtros"
                value={cena.optica.filtros}
                onChange={(v) => patchOptica({ filtros: v })}
                options={PRESETS.filtros}
              />
              <Toggle
                label="Matte Box"
                checked={cena.optica.matteBox}
                onChange={(checked) => patchOptica({ matteBox: checked })}
                className="col-span-2"
              />
            </div>
          </Group>

          <Group title="Mídia">
            <TextField
              label="Cartão / Rolo"
              value={cena.cartaoRolo}
              onChange={(v) => patch({ cartaoRolo: v })}
              placeholder="Ex.: A004"
            />
          </Group>

          <TextAreaField
            label="Observações"
            value={cena.observacoes}
            onChange={(v) => patch({ observacoes: v })}
            placeholder="Notas da cena…"
          />

          <Group title="Takes">
            {cena.takes.length === 0 ? (
              <p className="mb-3 text-sm text-zinc-500">
                Nenhum take. Adicione e marque os aprovados pelo diretor.
              </p>
            ) : (
              <ul className="mb-3 flex flex-col gap-2.5">
                {cena.takes.map((take) => (
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
