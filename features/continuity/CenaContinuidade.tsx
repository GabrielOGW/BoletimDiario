'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { DebouncedTextField } from '@/components/ui/DebouncedTextField';
import { SelectField } from '@/components/ui/SelectField';
import { ChevronDownIcon } from '@/components/ui/icons';
import { DAY_NIGHT_VALUES, INT_EXT_VALUES } from '@/domain/platform/enums';
import type {
  LocalCameraTakeData,
  LocalContinuityTakeData,
  LocalScene,
  LocalSetup,
  LocalSoundTakeData,
  LocalTake,
} from '@/lib/offline/db';
import { patchEntity } from '@/lib/offline/repos/diaria';
import { syncNow } from '@/lib/sync/engine';
import { cn } from '@/utils/cn';

import { EstadoDaCena } from './EstadoDoSet';
import { TakeContinuidade } from './TakeContinuidade';

/** Rótulos em pt-BR dos dois enums de cena. O banco guarda o valor; a tela mostra isto. */
const INT_EXT_LABEL: Record<string, string> = {
  INT: 'Interna',
  EXT: 'Externa',
  INT_EXT: 'Interna/Externa',
};

const DAY_NIGHT_LABEL: Record<string, string> = {
  DAY: 'Dia',
  NIGHT: 'Noite',
  DAWN: 'Amanhecer',
  DUSK: 'Entardecer',
};

const opcoes = (valores: readonly string[], rotulos: Record<string, string>) => [
  { value: '', label: '—' },
  ...valores.map((valor) => ({ value: valor, label: rotulos[valor] ?? valor })),
];

interface CenaContinuidadeProps {
  numero: string;
  blocos: LocalScene[];
  setups: LocalSetup[];
  takes: LocalTake[];
  dados: LocalContinuityTakeData[];
  camera: LocalCameraTakeData[];
  som: LocalSoundTakeData[];
  productionId: string;
  canEdit: boolean;
}

/**
 * A cena vista pela Continuidade — a mesma hierarquia dos outros dois módulos, com uma
 * diferença: **é aqui que os metadados da cena são preenchidos**.
 *
 * A continuísta é normalmente quem os preenche; os outros departamentos apenas consomem
 * (§1). Como uma cena com blocos A/B/C são três `Scene` que compartilham o número
 * (ADR-002), editar aqui **propaga para todos os blocos** — é a interface resolvendo a
 * duplicação que o modelo aceitou. Sem isso, corrigir a página da cena 24 deixaria 24B
 * com a página antiga, e o Relatório de Progresso somaria as duas versões.
 */
export function CenaContinuidade({
  numero,
  blocos,
  setups,
  takes,
  dados,
  camera,
  som,
  productionId,
  canEdit,
}: CenaContinuidadeProps) {
  const [aberto, setAberto] = useState(true);

  const ordenados = [...blocos].sort((a, b) =>
    (a.block ?? '').localeCompare(b.block ?? ''),
  );

  /** O primeiro bloco responde pelos metadados; a edição propaga para os demais. */
  const referencia = ordenados[0];
  const sceneIds = ordenados.map((bloco) => bloco.id);

  const takesDaCena = takes.filter((take) =>
    setups.some((setup) => setup.id === take.setupId),
  );
  const prints = dados.filter(
    (linha) => linha.selected && takesDaCena.some((take) => take.id === linha.takeId),
  ).length;

  /** Propaga o metadado para todos os blocos da cena — eles são a mesma cena (ADR-002). */
  function alteraMetadado(campo: string, valor: string | null) {
    for (const bloco of ordenados) {
      void patchEntity('scene', bloco.id, { [campo]: valor });
    }
    syncNow();
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface-raised">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((valor) => !valor)}
        className={cn(
          'flex w-full items-center gap-2.5 px-4 py-3 text-left transition hover:bg-surface-hover',
          aberto && 'border-b border-line',
        )}
      >
        <span className="text-base font-semibold text-zinc-100">Cena {numero}</span>
        {referencia?.page ? (
          <span className="font-mono text-xs text-zinc-400">{referencia.page}</span>
        ) : null}
        <span className="flex-1" />
        {prints > 0 ? <Badge tone="approved">{prints} print</Badge> : null}
        <span className="text-xs text-zinc-400">{takesDaCena.length} take(s)</span>
        <ChevronDownIcon
          size={20}
          className={cn('text-zinc-400 transition', aberto && 'rotate-180')}
        />
      </button>

      {aberto ? (
        <div className="flex flex-col gap-3 p-3">
          <MetadadosDaCena
            cena={referencia}
            canEdit={canEdit}
            onAltera={alteraMetadado}
            blocos={ordenados.length}
          />

          <EstadoDaCena
            productionId={productionId}
            sceneIds={sceneIds}
            canEdit={canEdit}
          />

          {ordenados.map((bloco) => (
            <BlocoContinuidade
              key={bloco.id}
              bloco={bloco}
              setups={setups.filter((setup) => setup.sceneId === bloco.id)}
              takes={takes}
              dados={dados}
              camera={camera}
              som={som}
              productionId={productionId}
              canEdit={canEdit}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Os metadados da cena — fechados, porque são preenchidos uma vez e lidos o dia inteiro.
 *
 * `characters` fica de fora: é lista ordenada, e lista ordenada não tem merge por campo
 * (synchronization.md §5). Anotar o elenco da cena num campo que não sincroniza seria pior
 * que não ter o campo.
 */
function MetadadosDaCena({
  cena,
  blocos,
  canEdit,
  onAltera,
}: {
  cena?: LocalScene;
  blocos: number;
  canEdit: boolean;
  onAltera: (campo: string, valor: string | null) => void;
}) {
  const [aberto, setAberto] = useState(false);

  if (!cena) return null;

  const resumo = [
    cena.page,
    cena.intExt ? INT_EXT_LABEL[cena.intExt] : '',
    cena.dayNight ? DAY_NIGHT_LABEL[cena.dayNight] : '',
    cena.location,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((valor) => !valor)}
        className={cn(
          'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-surface-hover',
          aberto && 'border-b border-line',
        )}
      >
        <span className="text-sm font-semibold text-zinc-200">Cena</span>
        <span className="flex-1" />
        <span className="truncate text-xs text-zinc-400">
          {resumo || 'Sem metadados'}
        </span>
        <ChevronDownIcon
          size={18}
          className={cn('shrink-0 text-zinc-400 transition', aberto && 'rotate-180')}
        />
      </button>

      {aberto ? (
        <div className="flex flex-col gap-3 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <DebouncedTextField
              label="Página"
              value={cena.page ?? ''}
              disabled={!canEdit}
              placeholder="2 4/8"
              onCommit={(valor) => onAltera('page', valor || null)}
            />
            <DebouncedTextField
              label="Story day"
              value={cena.storyDay ?? ''}
              disabled={!canEdit}
              placeholder="Dia 3"
              onCommit={(valor) => onAltera('storyDay', valor || null)}
            />
            <SelectField
              label="Int/Ext"
              value={cena.intExt ?? ''}
              disabled={!canEdit}
              options={opcoes(INT_EXT_VALUES, INT_EXT_LABEL)}
              onChange={(valor) => onAltera('intExt', valor || null)}
            />
            <SelectField
              label="Dia/Noite"
              value={cena.dayNight ?? ''}
              disabled={!canEdit}
              options={opcoes(DAY_NIGHT_VALUES, DAY_NIGHT_LABEL)}
              onChange={(valor) => onAltera('dayNight', valor || null)}
            />
          </div>

          <DebouncedTextField
            label="Locação"
            value={cena.location ?? ''}
            disabled={!canEdit}
            placeholder="Sala do apartamento"
            onCommit={(valor) => onAltera('location', valor || null)}
          />

          <DebouncedTextField
            label="Descrição"
            multiline
            value={cena.description ?? ''}
            disabled={!canEdit}
            placeholder="João chega em casa e encontra a porta aberta"
            onCommit={(valor) => onAltera('description', valor || null)}
          />

          {blocos > 1 ? (
            <p className="text-xs text-zinc-400">
              Esta cena tem {blocos} blocos. O que for editado aqui vale para todos —
              blocos são divisões da mesma cena de roteiro.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BlocoContinuidade({
  bloco,
  setups,
  takes,
  dados,
  camera,
  som,
  productionId,
  canEdit,
}: {
  bloco: LocalScene;
  setups: LocalSetup[];
  takes: LocalTake[];
  dados: LocalContinuityTakeData[];
  camera: LocalCameraTakeData[];
  som: LocalSoundTakeData[];
  productionId: string;
  canEdit: boolean;
}) {
  const ordenados = [...setups].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
  );

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5">
        <span className="text-sm font-semibold uppercase tracking-wide text-brand">
          Bloco {bloco.block ?? '—'}
        </span>
        <span className="flex-1" />
        <span className="text-xs text-zinc-400">{ordenados.length} plano(s)</span>
      </div>

      <div className="flex flex-col gap-3 p-3">
        {ordenados.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Sem planos neste bloco. Eles aparecem aqui assim que a Câmera os criar.
          </p>
        ) : null}

        {ordenados.map((setup) => (
          <PlanoContinuidade
            key={setup.id}
            setup={setup}
            takes={takes
              .filter((take) => take.setupId === setup.id)
              .sort((a, b) => a.number - b.number)}
            dados={dados}
            camera={camera}
            som={som}
            productionId={productionId}
            sceneId={bloco.id}
            canEdit={canEdit}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * O plano, com os campos de enquadramento que são da continuidade (§2).
 *
 * `camera` e `lens` **não** são redigitados aqui: vêm de `camera_take_data` do mesmo take,
 * e aparecem no cartão de cada take. Esse é um dos ganhos mais concretos da plataforma
 * sobre três cadernos separados.
 */
function PlanoContinuidade({
  setup,
  takes,
  dados,
  camera,
  som,
  productionId,
  sceneId,
  canEdit,
}: {
  setup: LocalSetup;
  takes: LocalTake[];
  dados: LocalContinuityTakeData[];
  camera: LocalCameraTakeData[];
  som: LocalSoundTakeData[];
  productionId: string;
  sceneId: string;
  canEdit: boolean;
}) {
  const [aberto, setAberto] = useState(true);

  const enquadramento = [setup.shotSize, setup.angle, setup.movement]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface-raised">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((valor) => !valor)}
        className={cn(
          'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-surface-hover',
          aberto && 'border-b border-line',
        )}
      >
        <span className="text-sm font-semibold text-zinc-100">Plano {setup.code}</span>
        {enquadramento ? (
          <span className="truncate text-xs text-zinc-400">{enquadramento}</span>
        ) : null}
        <span className="flex-1" />
        <span className="text-xs text-zinc-400">{takes.length} take(s)</span>
        <ChevronDownIcon
          size={18}
          className={cn('text-zinc-400 transition', aberto && 'rotate-180')}
        />
      </button>

      {aberto ? (
        <div className="flex flex-col gap-3 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <DebouncedTextField
              label="Tamanho"
              value={setup.shotSize ?? ''}
              disabled={!canEdit}
              placeholder="Close"
              onCommit={(valor) =>
                void patchEntity('setup', setup.id, { shotSize: valor || null }).then(
                  syncNow,
                )
              }
            />
            <DebouncedTextField
              label="Ângulo"
              value={setup.angle ?? ''}
              disabled={!canEdit}
              placeholder="Contra-plongée"
              onCommit={(valor) =>
                void patchEntity('setup', setup.id, { angle: valor || null }).then(
                  syncNow,
                )
              }
            />
            <DebouncedTextField
              label="Movimento"
              value={setup.movement ?? ''}
              disabled={!canEdit}
              placeholder="Travelling lateral"
              onCommit={(valor) =>
                void patchEntity('setup', setup.id, { movement: valor || null }).then(
                  syncNow,
                )
              }
            />
            <DebouncedTextField
              label="Eyeline"
              value={setup.eyeline ?? ''}
              disabled={!canEdit}
              placeholder="Câmera à direita do eixo"
              onCommit={(valor) =>
                void patchEntity('setup', setup.id, { eyeline: valor || null }).then(
                  syncNow,
                )
              }
            />
          </div>

          {takes.length === 0 ? (
            <p className="text-sm text-zinc-400">Nenhum take neste plano ainda.</p>
          ) : null}

          {takes.map((take) => (
            <TakeContinuidade
              key={take.id}
              take={take}
              dados={dados.find((linha) => linha.takeId === take.id)}
              camera={camera.find((linha) => linha.takeId === take.id)}
              som={som.find((linha) => linha.takeId === take.id)}
              productionId={productionId}
              sceneId={sceneId}
              setupId={setup.id}
              canEdit={canEdit}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
