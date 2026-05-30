'use client';

import { useId } from 'react';
import { useEditorMeta } from '@/hooks/useSuggestions';
import { cn } from '@/utils/cn';

interface CameraPickerProps {
  cameraId: string;
  cameraNome: string;
  onChange: (value: { cameraId: string; cameraNome: string }) => void;
}

/** Seletor de câmera do plano: chips das câmeras cadastradas + texto livre. */
export function CameraPicker({ cameraId, cameraNome, onChange }: CameraPickerProps) {
  const { cameras, suggestions } = useEditorMeta();
  const listId = useId();

  const isSelected = (id: string, nome: string) =>
    (cameraId && cameraId === id) || (!cameraId && cameraNome && cameraNome === nome);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
        Câmera utilizada
      </span>

      {cameras.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {cameras.map((camera) => {
            const label = camera.nomeId || camera.modelo || 'Câmera';
            const selected = isSelected(camera.id, camera.nomeId);
            return (
              <button
                key={camera.id}
                type="button"
                onClick={() =>
                  onChange({ cameraId: camera.id, cameraNome: camera.nomeId })
                }
                className={cn(
                  'flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition',
                  selected
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-line bg-surface text-zinc-300 hover:bg-surface-hover',
                )}
              >
                {label}
                {camera.modelo && camera.nomeId ? (
                  <span className="text-xs text-zinc-500">· {camera.modelo}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <input
        aria-label="Câmera utilizada (texto livre)"
        value={cameraNome}
        list={listId}
        placeholder={cameras.length > 0 ? 'Outra câmera / digitar…' : 'Ex.: A CAM'}
        onChange={(event) => onChange({ cameraId: '', cameraNome: event.target.value })}
        className="h-12 w-full rounded-xl border border-line bg-surface px-3.5 text-base text-zinc-100 transition placeholder:text-zinc-600 focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      <datalist id={listId}>
        {suggestions.cameraNome.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  );
}
