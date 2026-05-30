'use client';

import type { CameraCadastrada } from '@/types/boletim';
import { SectionCard } from '@/components/layout/SectionCard';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { CameraIcon, PlusIcon, TrashIcon } from '@/components/ui/icons';

interface CamerasSectionProps {
  items: CameraCadastrada[];
  onAdd: () => void;
  onChange: (id: string, patch: Partial<CameraCadastrada>) => void;
  onRemove: (id: string) => void;
}

export function CamerasSection({
  items,
  onAdd,
  onChange,
  onRemove,
}: CamerasSectionProps) {
  return (
    <SectionCard title="Câmeras cadastradas" icon={<CameraIcon size={18} />}>
      {items.length === 0 ? (
        <p className="mb-3 text-sm text-zinc-500">
          Cadastre as câmeras do dia (A CAM, B CAM…). Cada plano poderá selecionar a
          câmera utilizada.
        </p>
      ) : (
        <ul className="mb-3 flex flex-col gap-3">
          {items.map((camera) => (
            <li
              key={camera.id}
              className="rounded-xl border border-line bg-surface-raised p-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Nome / ID"
                  value={camera.nomeId}
                  onChange={(v) => onChange(camera.id, { nomeId: v })}
                  placeholder="Ex.: A CAM"
                />
                <TextField
                  label="Modelo"
                  value={camera.modelo}
                  onChange={(v) => onChange(camera.id, { modelo: v })}
                  placeholder="Ex.: Komodo RED"
                />
                <TextField
                  label="Operador(a)"
                  value={camera.operador}
                  onChange={(v) => onChange(camera.id, { operador: v })}
                />
                <TextField
                  label="Foco"
                  value={camera.foco}
                  onChange={(v) => onChange(camera.id, { foco: v })}
                />
                <TextField
                  label="Claquetista"
                  value={camera.claquetista}
                  onChange={(v) => onChange(camera.id, { claquetista: v })}
                  className="col-span-2"
                />
              </div>
              <div className="mt-2 flex justify-end">
                <IconButton
                  label="Remover câmera"
                  variant="danger"
                  icon={<TrashIcon size={20} />}
                  onClick={() => onRemove(camera.id)}
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
        Adicionar câmera
      </Button>
    </SectionCard>
  );
}
