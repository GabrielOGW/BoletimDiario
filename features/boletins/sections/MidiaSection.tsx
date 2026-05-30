'use client';

import type { MidiaSuporte } from '@/types/boletim';
import { SectionCard } from '@/components/layout/SectionCard';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { HardDriveIcon, PlusIcon, TrashIcon } from '@/components/ui/icons';
import { PRESETS } from '@/lib/constants';

interface MidiaSectionProps {
  items: MidiaSuporte[];
  onAdd: () => void;
  onChange: (id: string, patch: Partial<MidiaSuporte>) => void;
  onRemove: (id: string) => void;
}

export function MidiaSection({ items, onAdd, onChange, onRemove }: MidiaSectionProps) {
  return (
    <SectionCard
      title="Mídia / Suporte"
      icon={<HardDriveIcon size={18} />}
      collapsible
      defaultOpen={false}
      summary={`${items.length} ${items.length === 1 ? 'cartão' : 'cartões'}`}
    >
      {items.length === 0 ? (
        <p className="mb-3 text-sm text-zinc-500">
          Nenhum cartão registrado. Adicione os cartões/SSDs usados no dia.
        </p>
      ) : (
        <ul className="mb-3 flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-line bg-surface-raised p-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Tipo de mídia"
                  value={item.tipoMidia}
                  onChange={(v) => onChange(item.id, { tipoMidia: v })}
                  options={PRESETS.tipoMidia}
                />
                <TextField
                  label="Nº do cartão"
                  value={item.numeroCartao}
                  onChange={(v) => onChange(item.id, { numeroCartao: v })}
                  placeholder="Ex.: A004"
                />
                <TextField
                  label="Quantidade"
                  value={item.quantidade}
                  onChange={(v) => onChange(item.id, { quantidade: v })}
                  inputMode="numeric"
                />
                <TextField
                  label="Responsável"
                  value={item.responsavel}
                  onChange={(v) => onChange(item.id, { responsavel: v })}
                />
              </div>
              <div className="mt-2 flex justify-end">
                <IconButton
                  label="Remover mídia"
                  variant="danger"
                  icon={<TrashIcon size={18} />}
                  onClick={() => onRemove(item.id)}
                />
              </div>
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
        Adicionar mídia
      </Button>
    </SectionCard>
  );
}
