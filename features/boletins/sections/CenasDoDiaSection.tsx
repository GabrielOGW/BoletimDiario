'use client';

import type { CenasDoDia } from '@/types/boletim';
import { SectionCard } from '@/components/layout/SectionCard';
import { TextField } from '@/components/ui/TextField';
import { TextAreaField } from '@/components/ui/TextAreaField';
import { ClapperboardIcon } from '@/components/ui/icons';

interface CenasDoDiaSectionProps {
  value: CenasDoDia;
  onChange: (patch: Partial<CenasDoDia>) => void;
  /** Totais calculados automaticamente, exibidos como referência. */
  auto: { totalTakes: number; takesAprovados: number };
}

export function CenasDoDiaSection({ value, onChange, auto }: CenasDoDiaSectionProps) {
  return (
    <SectionCard title="Cenas do Dia" icon={<ClapperboardIcon size={18} />}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField
          label="Cenas realizadas"
          value={value.cenasRealizadas}
          onChange={(v) => onChange({ cenasRealizadas: v })}
          placeholder="Ex.: 1, 2, 16, 17.1"
          className="sm:col-span-2"
        />
        <TextField
          label="Total de takes"
          value={value.totalTakes}
          onChange={(v) => onChange({ totalTakes: v })}
          hint={`Contagem automática: ${auto.totalTakes}`}
          inputMode="numeric"
        />
        <TextField
          label="Tomadas aprovadas"
          value={value.tomadasAprovadas}
          onChange={(v) => onChange({ tomadasAprovadas: v })}
          hint={`Contagem automática: ${auto.takesAprovados}`}
          inputMode="numeric"
        />
      </div>
      <TextAreaField
        label="Continuidade"
        value={value.continuidade}
        onChange={(v) => onChange({ continuidade: v })}
        placeholder="Pendências, notas de continuidade…"
        className="mt-3"
        rows={2}
      />
    </SectionCard>
  );
}
