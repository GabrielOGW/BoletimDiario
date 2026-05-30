'use client';

import type { Horarios } from '@/types/boletim';
import { SectionCard } from '@/components/layout/SectionCard';
import { TextField } from '@/components/ui/TextField';
import { ClockIcon } from '@/components/ui/icons';

interface HorariosSectionProps {
  value: Horarios;
  onChange: (patch: Partial<Horarios>) => void;
}

export function HorariosSection({ value, onChange }: HorariosSectionProps) {
  const showLegacy =
    !value.almocoInicio && !value.almocoFim && value.almoco.trim().length > 0;

  return (
    <SectionCard title="Horários" icon={<ClockIcon size={18} />}>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Início"
          type="time"
          value={value.inicio}
          onChange={(v) => onChange({ inicio: v })}
        />
        <TextField
          label="Fim"
          type="time"
          value={value.fim}
          onChange={(v) => onChange({ fim: v })}
        />
        <TextField
          label="Almoço — início"
          type="time"
          value={value.almocoInicio}
          onChange={(v) => onChange({ almocoInicio: v })}
        />
        <TextField
          label="Almoço — fim"
          type="time"
          value={value.almocoFim}
          onChange={(v) => onChange({ almocoFim: v })}
        />
        <TextField
          label="Total de horas"
          value={value.totalHoras}
          onChange={(v) => onChange({ totalHoras: v })}
          placeholder="Ex.: 11h"
        />
        <TextField
          label="Hora extra"
          value={value.horaExtra}
          onChange={(v) => onChange({ horaExtra: v })}
          placeholder="Ex.: 1h"
        />
      </div>
      {showLegacy ? (
        <p className="mt-2 text-xs text-zinc-500">
          Valor anterior de almoço: <span className="text-zinc-300">{value.almoco}</span>{' '}
          — preencha início/fim acima.
        </p>
      ) : null}
    </SectionCard>
  );
}
