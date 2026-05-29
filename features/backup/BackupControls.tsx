'use client';

import { useRef, useState } from 'react';
import { exportAllBoletins, importBackupFile } from '@/lib/backup';
import { Button } from '@/components/ui/Button';
import { DownloadIcon, UploadIcon } from '@/components/ui/icons';
import { cn } from '@/utils/cn';

interface BackupControlsProps {
  /** Quantidade atual de boletins (desabilita exportar quando vazio). */
  count: number;
}

type Feedback = { tone: 'ok' | 'error'; message: string } | null;

export function BackupControls({ count }: BackupControlsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const result = await importBackupFile(file, 'merge');
      setFeedback({
        tone: 'ok',
        message: `${result.imported} boletim(ns) importado(s) com sucesso.`,
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Falha ao importar.',
      });
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          fullWidth
          leftIcon={<DownloadIcon size={18} />}
          onClick={() => {
            exportAllBoletins();
            setFeedback({ tone: 'ok', message: 'Backup exportado (.json).' });
          }}
          disabled={count === 0}
        >
          Exportar backup
        </Button>
        <Button
          variant="secondary"
          fullWidth
          leftIcon={<UploadIcon size={18} />}
          onClick={() => inputRef.current?.click()}
        >
          Importar backup
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => void handleImport(event.target.files?.[0])}
        />
      </div>
      {feedback ? (
        <p
          className={cn(
            'mt-2 text-center text-xs',
            feedback.tone === 'ok' ? 'text-approved' : 'text-red-400',
          )}
        >
          {feedback.message}
        </p>
      ) : (
        <p className="mt-2 text-center text-[11px] text-zinc-600">
          Backup local em JSON — restaure ao limpar o navegador ou trocar de aparelho.
        </p>
      )}
    </div>
  );
}
