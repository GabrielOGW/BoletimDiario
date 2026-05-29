'use client';

import type { Cena } from '@/types/boletim';
import { CenaCard } from '@/features/boletins/sections/CenaCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ClapperboardIcon, PlusIcon } from '@/components/ui/icons';

interface CenasSectionProps {
  cenas: Cena[];
  onAdd: () => void;
  onChangeCena: (id: string, next: Cena) => void;
  onRemoveCena: (id: string) => void;
  onDuplicateCena: (id: string) => void;
  onMoveCena: (index: number, dir: -1 | 1) => void;
}

export function CenasSection({
  cenas,
  onAdd,
  onChangeCena,
  onRemoveCena,
  onDuplicateCena,
  onMoveCena,
}: CenasSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5 px-1">
        <span className="text-brand">
          <ClapperboardIcon size={18} />
        </span>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-200">
          Cenas
        </h2>
        <Badge tone="brand">{cenas.length}</Badge>
      </div>

      {cenas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface/50 px-5 py-10 text-center">
          <p className="text-sm text-zinc-400">Nenhuma cena ainda.</p>
          <p className="mt-1 text-xs text-zinc-600">
            Cada cena vira um card expansível com configurações, óptica e takes.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {cenas.map((cena, index) => (
            <CenaCard
              key={cena.id}
              cena={cena}
              index={index}
              total={cenas.length}
              onChange={(next) => onChangeCena(cena.id, next)}
              onRemove={() => onRemoveCena(cena.id)}
              onDuplicate={() => onDuplicateCena(cena.id)}
              onMove={(dir) => onMoveCena(index, dir)}
            />
          ))}
        </div>
      )}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        leftIcon={<PlusIcon size={20} />}
        onClick={onAdd}
      >
        Adicionar cena
      </Button>
    </section>
  );
}
