'use client';

import type { Camera } from '@/types/boletim';
import { SectionCard } from '@/components/layout/SectionCard';
import { TextField } from '@/components/ui/TextField';
import { CameraIcon } from '@/components/ui/icons';

interface CameraSectionProps {
  value: Camera;
  onChange: (patch: Partial<Camera>) => void;
}

export function CameraSection({ value, onChange }: CameraSectionProps) {
  return (
    <SectionCard title="Câmera" icon={<CameraIcon size={18} />}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField
          label="Câmera Nº / ID"
          value={value.numeroId}
          onChange={(v) => onChange({ numeroId: v })}
          placeholder="Ex.: A"
        />
        <TextField
          label="Modelo"
          value={value.modelo}
          onChange={(v) => onChange({ modelo: v })}
          placeholder="Ex.: RED V-Raptor"
        />
        <TextField
          label="Operador(a)"
          value={value.operador}
          onChange={(v) => onChange({ operador: v })}
        />
        <TextField
          label="Foco"
          value={value.foco}
          onChange={(v) => onChange({ foco: v })}
        />
        <TextField
          label="Claquetista"
          value={value.claquetista}
          onChange={(v) => onChange({ claquetista: v })}
          className="sm:col-span-2"
        />
      </div>
    </SectionCard>
  );
}
