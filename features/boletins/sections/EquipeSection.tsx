'use client';

import type { MembroEquipe } from '@/types/boletim';
import { SectionCard } from '@/components/layout/SectionCard';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { PlusIcon, TrashIcon, UsersIcon } from '@/components/ui/icons';
import { PRESETS } from '@/lib/constants';

interface EquipeSectionProps {
  items: MembroEquipe[];
  onAdd: () => void;
  onChange: (id: string, patch: Partial<MembroEquipe>) => void;
  onRemove: (id: string) => void;
}

export function EquipeSection({ items, onAdd, onChange, onRemove }: EquipeSectionProps) {
  return (
    <SectionCard
      title="Equipe de Câmera"
      icon={<UsersIcon size={18} />}
      collapsible
      summary={`${items.length} ${items.length === 1 ? 'pessoa' : 'pessoas'}`}
    >
      {items.length === 0 ? (
        <p className="mb-3 text-sm text-zinc-500">
          Adicione os integrantes da equipe de câmera do dia.
        </p>
      ) : (
        <ul className="mb-3 flex flex-col gap-2.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-end gap-2">
              <TextField
                label="Nome"
                value={item.nome}
                onChange={(v) => onChange(item.id, { nome: v })}
                className="flex-1"
              />
              <TextField
                label="Função"
                value={item.funcao}
                onChange={(v) => onChange(item.id, { funcao: v })}
                options={PRESETS.funcao}
                className="flex-1"
              />
              <IconButton
                label="Remover integrante"
                variant="danger"
                icon={<TrashIcon size={18} />}
                onClick={() => onRemove(item.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="secondary"
        fullWidth
        leftIcon={<PlusIcon size={18} />}
        onClick={onAdd}
      >
        Adicionar integrante
      </Button>
    </SectionCard>
  );
}
