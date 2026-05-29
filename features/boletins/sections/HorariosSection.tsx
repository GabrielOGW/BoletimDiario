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
  return (
    <SectionCard title="Horários" icon={<ClockIcon size={18} />}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
          label="Almoço"
          value={value.almoco}
          onChange={(v) => onChange({ almoco: v })}
          placeholder="12:30–13:30"
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
    </SectionCard>
  );
}
