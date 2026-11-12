'use client';

import { useState } from 'react';

import { SectionCard } from '@/components/layout/SectionCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DebouncedTextField } from '@/components/ui/DebouncedTextField';
import { IconButton } from '@/components/ui/IconButton';
import { TextField } from '@/components/ui/TextField';
import {
  ChevronDownIcon,
  HardDriveIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/ui/icons';
import {
  ensureSoundRoll,
  patchSoundRoll,
  removeSoundRoll,
} from '@/lib/offline/repos/som';
import { syncNow } from '@/lib/sync/engine';
import { cn } from '@/utils/cn';

import type { RoloDoDia } from './estrutura';

/**
 * Rolos e cartões de áudio da diária (ADR-041).
 *
 * A lista é a **união** do que foi cadastrado com o que os takes dizem: o mixer anota o
 * roll no take o dia inteiro e cadastra o cartão quando sobra um minuto. Um roll que só
 * existe nos takes aparece aqui do mesmo jeito, com os arquivos dele — preencher mídia ou
 * gravador é o que o transforma num cadastro.
 *
 * Os arquivos de cada roll **não são digitados aqui**: são os takes que apontam para ele,
 * na ordem da diária. Uma segunda lista seria uma segunda verdade sobre o mesmo arquivo.
 */
export function RolosSom({
  rolos,
  productionId,
  shootingDayId,
  data,
  canEdit,
}: {
  rolos: RoloDoDia[];
  productionId: string;
  shootingDayId: string;
  /** A data da diária, já formatada — o roll é do dia. */
  data: string;
  canEdit: boolean;
}) {
  const [novo, setNovo] = useState('');

  async function cadastra(rotulo: string): Promise<string> {
    return ensureSoundRoll({ productionId, shootingDayId, label: rotulo });
  }

  return (
    <SectionCard
      title="Rolos e cartões"
      icon={<HardDriveIcon size={18} />}
      collapsible
      defaultOpen={false}
      summary={
        rolos.length > 0
          ? rolos.map((rolo) => `${rolo.rotulo} (${rolo.arquivos.length})`).join(' · ')
          : 'Nenhum ainda'
      }
    >
      <div className="flex flex-col gap-3">
        {rolos.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Nenhum roll ainda. Ele aparece aqui sozinho quando um take recebe o roll — ou
            cadastre o cartão agora, antes de gravar.
          </p>
        ) : null}

        {rolos.map((rolo) => (
          <Rolo
            key={rolo.rotulo}
            rolo={rolo}
            data={data}
            canEdit={canEdit}
            onCadastra={cadastra}
          />
        ))}

        {canEdit ? (
          <div className="flex items-end gap-2">
            <TextField
              label="Novo roll / cartão"
              className="flex-1"
              value={novo}
              onChange={setNovo}
              placeholder="005"
            />
            <Button
              variant="secondary"
              leftIcon={<PlusIcon size={16} />}
              disabled={!novo.trim()}
              onClick={async () => {
                await cadastra(novo);
                setNovo('');
                syncNow();
              }}
            >
              Cadastrar
            </Button>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

function Rolo({
  rolo,
  data,
  canEdit,
  onCadastra,
}: {
  rolo: RoloDoDia;
  data: string;
  canEdit: boolean;
  onCadastra: (rotulo: string) => Promise<string>;
}) {
  const [aberto, setAberto] = useState(false);
  const circled = rolo.arquivos.filter((linha) => linha.circled).length;

  /** O primeiro campo preenchido cadastra o roll — antes disso ele só existia nos takes. */
  async function altera(changes: Record<string, unknown>) {
    const id = rolo.id ?? (await onCadastra(rolo.rotulo));
    await patchSoundRoll(id, changes);
    syncNow();
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface-raised">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((valor) => !valor)}
        className={cn(
          'flex min-h-[48px] w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-surface-hover',
          aberto && 'border-b border-line',
        )}
      >
        <span className="font-mono text-sm font-semibold text-zinc-100">
          Roll {rolo.rotulo}
        </span>
        {rolo.midia ? (
          <span className="truncate text-xs text-zinc-400">{rolo.midia}</span>
        ) : null}
        <span className="flex-1" />
        {circled > 0 ? <Badge tone="approved">{circled} circled</Badge> : null}
        <span className="text-xs text-zinc-400">{rolo.arquivos.length} arquivo(s)</span>
        <ChevronDownIcon
          size={16}
          className={cn('shrink-0 text-zinc-400 transition', aberto && 'rotate-180')}
        />
      </button>

      {aberto ? (
        <div className="flex flex-col gap-3 p-3">
          <p className="text-xs text-zinc-400">
            {data}
            {rolo.id ? '' : ' · ainda não cadastrado: preencha um campo para cadastrar'}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <DebouncedTextField
              label="Mídia / cartão"
              value={rolo.midia}
              disabled={!canEdit}
              placeholder="SD #2 · 128 GB"
              onCommit={(valor) => void altera({ media: valor || null })}
            />
            <DebouncedTextField
              label="Equipamento"
              value={rolo.gravador}
              disabled={!canEdit}
              placeholder="Sound Devices 833"
              onCommit={(valor) => void altera({ recorder: valor || null })}
            />
          </div>
          <DebouncedTextField
            label="Observações"
            value={rolo.nota}
            disabled={!canEdit}
            placeholder="Cartão trocado no almoço; cópia conferida"
            onCommit={(valor) => void altera({ notes: valor || null })}
          />

          {rolo.arquivos.length > 0 ? (
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
              {rolo.arquivos.map((linha) => (
                <li
                  key={linha.takeId}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-300"
                >
                  <span className="font-mono text-zinc-100">{linha.arquivo || '—'}</span>
                  <span className="text-zinc-400">
                    {linha.cena}
                    {linha.bloco}/{linha.plano}/{linha.take}
                  </span>
                  <span className="flex-1" />
                  {linha.problemas.length > 0 || linha.obsProblemas ? (
                    <span className="text-amber-400">problema</span>
                  ) : null}
                  {linha.circled ? <span className="text-approved">circled</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-zinc-400">Nenhum arquivo neste roll ainda.</p>
          )}

          {canEdit && rolo.id ? (
            <div className="flex justify-end">
              <IconButton
                label={`Remover cadastro do roll ${rolo.rotulo}`}
                variant="danger"
                icon={<TrashIcon size={16} />}
                onClick={() => void removeSoundRoll(rolo.id as string).then(syncNow)}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
