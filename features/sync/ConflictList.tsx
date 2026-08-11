'use client';

import { useLiveQuery } from 'dexie-react-hooks';

import { SectionCard } from '@/components/layout/SectionCard';
import { Button } from '@/components/ui/Button';
import { getDb } from '@/lib/offline/db';
import { resolveConflict } from '@/lib/sync/engine';

const ROTULO: Record<string, string> = {
  number: 'Número',
  status: 'Status',
  notes: 'Notas',
  code: 'Setup',
  name: 'Nome',
  description: 'Descrição',
  location: 'Locação',
  deletedAt: 'Exclusão',
};

function mostra(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  return String(valor);
}

/**
 * Os conflitos pendentes desta produção.
 *
 * Um conflito é de **um campo**, nunca de um registro: enquanto ele espera decisão, o
 * take 6 continua, o outro campo do mesmo take continua, e o Som nunca soube que existiu.
 * Por isso esta lista é um cartão à parte, e não um diálogo no meio da filmagem.
 */
export function ConflictList({ productionId }: { productionId: string }) {
  const conflitos = useLiveQuery(
    () =>
      getDb()
        .syncConflicts.where('[productionId+status]')
        .equals([productionId, 'PENDING'])
        .toArray(),
    [productionId],
    [],
  );

  if (!conflitos || conflitos.length === 0) return null;

  return (
    <SectionCard title={`Conflitos · ${conflitos.length}`}>
      <ul className="flex flex-col gap-4">
        {conflitos.map((conflito) => (
          <li key={conflito.id} className="rounded-xl border border-line bg-surface p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              {ROTULO[conflito.field] ?? conflito.field}
            </p>

            <dl className="mt-2 flex flex-col gap-1 text-sm">
              <div className="flex gap-2">
                <dt className="text-zinc-500">Seu valor:</dt>
                <dd className="text-zinc-100">{mostra(conflito.meuValor)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-zinc-500">Valor atual:</dt>
                <dd className="text-zinc-100">
                  {mostra(conflito.valorRemoto)}
                  {conflito.remotoPor ? (
                    <span className="text-zinc-500"> · {conflito.remotoPor}</span>
                  ) : null}
                </dd>
              </div>
            </dl>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void resolveConflict(conflito.id, 'MEU')}>
                Usar {mostra(conflito.meuValor)}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void resolveConflict(conflito.id, 'REMOTO')}
              >
                Manter {mostra(conflito.valorRemoto)}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
