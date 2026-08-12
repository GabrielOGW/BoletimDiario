'use client';

import { SectionCard } from '@/components/layout/SectionCard';
import { Button } from '@/components/ui/Button';
import { DebouncedTextField } from '@/components/ui/DebouncedTextField';
import { FileTextIcon } from '@/components/ui/icons';
import type { LocalDailyProgressReport } from '@/lib/offline/db';
import {
  ensureDailyProgressReport,
  patchDailyProgressReport,
} from '@/lib/offline/repos/continuidade';
import { syncNow } from '@/lib/sync/engine';

import type { ContagensDoDia } from './estrutura';

/**
 * O Relatório de Progresso da Diária — o documento que o levantamento achou faltando.
 *
 * A divisão da tela **é** a decisão de modelagem (ADR-034): em cima, o que a plataforma
 * já sabe e apenas conta; embaixo, os poucos campos que exigem mão humana. Hoje esse
 * relatório é montado à mão no fim do dia, somando números de três cadernos — aqui a
 * metade de cima já está pronta antes de alguém abrir a tela.
 *
 * Nada aqui espera rede: o wrap acontece na locação, e é exatamente quando não há sinal.
 */
export function RelatorioProgresso({
  productionId,
  shootingDayId,
  relatorio,
  contagens,
  canEdit,
  onImprimir,
}: {
  productionId: string;
  shootingDayId: string;
  relatorio?: LocalDailyProgressReport;
  contagens: ContagensDoDia;
  canEdit: boolean;
  onImprimir: () => void;
}) {
  async function altera(changes: Record<string, unknown>) {
    const id = await ensureDailyProgressReport({ productionId, shootingDayId });
    await patchDailyProgressReport(id, changes);
    syncNow();
  }

  return (
    <SectionCard
      title="Relatório de progresso"
      icon={<FileTextIcon size={18} />}
      collapsible
      defaultOpen={false}
      summary={`${contagens.cenas} cena(s) · ${contagens.takes} take(s)`}
    >
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Contagem rotulo="Cenas" valor={contagens.cenas} />
          <Contagem rotulo="Planos" valor={contagens.planos} />
          <Contagem rotulo="Takes" valor={contagens.takes} />
          <Contagem rotulo="Prints" valor={contagens.prints} destaque />
        </dl>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Texto rotulo="Páginas do roteiro" valor={paginasComRessalva(contagens)} />
          <Texto rotulo="Material cronometrado" valor={contagens.duracao || '—'} />
          <Texto rotulo="Cartões" valor={contagens.cartoes.join(' · ') || '—'} />
          <Texto rotulo="Rolls" valor={contagens.rolls.join(' · ') || '—'} />
        </dl>

        <p className="text-xs text-zinc-500">
          Contado a partir da diária — cenas e planos saem dos registros, cartões vêm da
          Câmera e rolls do Som. Nada disso é digitado aqui, e por isso não pode divergir
          do que foi preenchido.
        </p>

        <div className="h-px bg-line" />

        <div className="grid gap-3 sm:grid-cols-2">
          <DebouncedTextField
            label="Hora do primeiro take"
            value={relatorio?.firstTakeAt?.slice(0, 5) ?? ''}
            disabled={!canEdit}
            placeholder="07:42"
            inputMode="numeric"
            onCommit={(valor) => void altera({ firstTakeAt: valor || null })}
          />
          <DebouncedTextField
            label="Páginas rodadas"
            value={relatorio?.pagesShot ?? ''}
            disabled={!canEdit}
            placeholder={contagens.paginas.formatado}
            onCommit={(valor) => void altera({ pagesShot: valor || null })}
          />
        </div>

        <DebouncedTextField
          label="Minutagem estimada"
          value={relatorio?.estimatedMinutes ?? ''}
          disabled={!canEdit}
          placeholder="3:20"
          onCommit={(valor) => void altera({ estimatedMinutes: valor || null })}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <DebouncedTextField
            label="Cenas cobertas"
            value={relatorio?.scenesCovered ?? ''}
            disabled={!canEdit}
            placeholder={contagens.cenasRodadas.join(', ')}
            onCommit={(valor) => void altera({ scenesCovered: valor || null })}
          />
          <DebouncedTextField
            label="Cenas parciais"
            value={relatorio?.scenesPartial ?? ''}
            disabled={!canEdit}
            placeholder="31"
            onCommit={(valor) => void altera({ scenesPartial: valor || null })}
          />
          <DebouncedTextField
            label="Cenas puladas"
            value={relatorio?.scenesSkipped ?? ''}
            disabled={!canEdit}
            placeholder="27, 28"
            onCommit={(valor) => void altera({ scenesSkipped: valor || null })}
          />
          <DebouncedTextField
            label="Cenas acrescentadas"
            value={relatorio?.scenesAdded ?? ''}
            disabled={!canEdit}
            placeholder="24C"
            onCommit={(valor) => void altera({ scenesAdded: valor || null })}
          />
        </div>

        <p className="text-xs text-zinc-500">
          A cobertura é a única parte que a plataforma não sabe sozinha: só quem estava em
          set sabe que a cena 31 ficou pela metade. O que aparece em cinza é sugestão do
          que foi rodado — não é o que vai impresso.
        </p>

        <DebouncedTextField
          label="Observações do dia"
          multiline
          rows={4}
          value={relatorio?.notes ?? ''}
          disabled={!canEdit}
          placeholder="Choveu depois do almoço; a cena 31 ficou para amanhã."
          onCommit={(valor) => void altera({ notes: valor || null })}
        />

        <DebouncedTextField
          label="Assinatura"
          value={relatorio?.signedBy ?? ''}
          disabled={!canEdit}
          placeholder="Nome de quem fecha o relatório"
          onCommit={(valor) => void altera({ signedBy: valor || null })}
        />

        <Button variant="secondary" fullWidth onClick={onImprimir}>
          Ver relatório para impressão
        </Button>
      </div>
    </SectionCard>
  );
}

/**
 * O total de páginas, com a ressalva quando algo não deu para somar.
 *
 * Errar para menos em silêncio, num número que a produção lê no fim do dia, é o defeito
 * que ninguém descobre (ADR-034).
 */
export function paginasComRessalva(contagens: ContagensDoDia): string {
  const { formatado, naoSomados } = contagens.paginas;
  if (naoSomados.length === 0) return formatado;
  return `${formatado} (+${naoSomados.length} sem soma)`;
}

function Contagem({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{rotulo}</dt>
      <dd
        className={
          destaque
            ? 'text-lg font-semibold text-approved'
            : 'text-lg font-semibold text-zinc-100'
        }
      >
        {valor}
      </dd>
    </div>
  );
}

function Texto({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{rotulo}</dt>
      <dd className="truncate text-sm text-zinc-200">{valor}</dd>
    </div>
  );
}
