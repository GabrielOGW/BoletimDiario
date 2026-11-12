'use client';

import { Button } from '@/components/ui/Button';
import { PlusIcon } from '@/components/ui/icons';
import type { LocalSetup } from '@/lib/offline/db';
import { createSetup } from '@/lib/offline/repos/diaria';
import { syncNow } from '@/lib/sync/engine';

import { proximoCodigoDePlano } from './cenas';

/**
 * Criar plano fora da Câmera — o mesmo gesto para Continuidade e Som (ADR-040).
 *
 * Compartilhado pelo mesmo motivo de `NovaCena`: um caminho de criação, não um por
 * módulo. O código segue a numeração da Câmera (`proximoCodigoDePlano`) e o id é derivado,
 * então quem cria primeiro não importa — o plano 3 do bloco é um só.
 *
 * O Boletim de Câmera **não** usa este componente: o dele continua exatamente como era.
 */
export function NovoPlano({
  productionId,
  sceneId,
  shootingDayId,
  setups,
  onCriado,
}: {
  productionId: string;
  sceneId: string;
  shootingDayId: string;
  /** Os planos que o bloco já tem, para numerar o próximo. */
  setups: readonly LocalSetup[];
  onCriado?: (setupId: string) => void | Promise<void>;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      leftIcon={<PlusIcon size={15} />}
      onClick={async () => {
        const setupId = await createSetup({
          productionId,
          sceneId,
          shootingDayId,
          code: proximoCodigoDePlano(setups),
          sortOrder: setups.length,
        });
        await onCriado?.(setupId);
        syncNow();
      }}
    >
      Novo plano
    </Button>
  );
}
