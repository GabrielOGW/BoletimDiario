'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { PlusIcon } from '@/components/ui/icons';
import { createScene } from '@/lib/offline/repos/diaria';
import { syncNow } from '@/lib/sync/engine';

/**
 * Criar cena — o mesmo gesto para todos os departamentos.
 *
 * Nasceu dentro do módulo de Câmera. Virou compartilhado na Fase 6 porque o Som também
 * chega primeiro às vezes (playback, room tone antes de a câmera rodar), e o id derivado
 * faz os dois criarem **a mesma** cena em vez de duas (ADR-019) — o que só é verdade
 * enquanto houver um caminho de criação, e não um por módulo.
 *
 * Bloco A por padrão, como `createCena` sempre fez no boletim.
 */
export function NovaCena({ productionId }: { productionId: string }) {
  const [numero, setNumero] = useState('');
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <Button
        size="sm"
        variant="primary"
        leftIcon={<PlusIcon size={15} />}
        onClick={() => setAberto(true)}
      >
        Cena
      </Button>
    );
  }

  return (
    <div className="flex items-end gap-2">
      <TextField
        label="Nº"
        className="w-24"
        value={numero}
        onChange={setNumero}
        placeholder="24"
      />
      <Button
        size="sm"
        variant="primary"
        disabled={!numero.trim()}
        onClick={async () => {
          await createScene({ productionId, number: numero.trim(), block: 'A' });
          setNumero('');
          setAberto(false);
          syncNow();
        }}
      >
        Criar
      </Button>
    </div>
  );
}
