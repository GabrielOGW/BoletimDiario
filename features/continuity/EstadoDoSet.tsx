'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DebouncedTextField } from '@/components/ui/DebouncedTextField';
import { IconButton } from '@/components/ui/IconButton';
import { ChevronDownIcon, PlusIcon, TrashIcon } from '@/components/ui/icons';
import {
  createEstado,
  listEstado,
  patchEstado,
  removeEstado,
  type ColecaoDeEstado,
} from '@/lib/offline/repos/continuidade';
import { syncNow } from '@/lib/sync/engine';
import { cn } from '@/utils/cn';

/**
 * As quatro coleções de estado do set (§4).
 *
 * Mesma forma, então mesma tela: props, figurino, cabelo/maquiagem e cenografia diferem no
 * nome do campo-chave e nos campos secundários, não no comportamento. Quatro componentes
 * paralelos seriam quatro lugares para o mesmo defeito.
 */
interface DefinicaoDaColecao {
  colecao: ColecaoDeEstado;
  titulo: string;
  /** O campo que identifica o item — `name`, `character` ou `element`. */
  chave: string;
  rotuloDaChave: string;
  exemplo: string;
  /** Os campos secundários, na ordem em que o caderno os escreve. */
  campos: { campo: string; rotulo: string; exemplo: string }[];
}

export const COLECOES: DefinicaoDaColecao[] = [
  {
    colecao: 'continuityProp',
    titulo: 'Props',
    chave: 'name',
    rotuloDaChave: 'Objeto',
    exemplo: 'Copo',
    campos: [
      { campo: 'position', rotulo: 'Posição', exemplo: 'Mesa, lado direito' },
      { campo: 'state', rotulo: 'Estado', exemplo: '50% cheio' },
      { campo: 'quantity', rotulo: 'Quantidade', exemplo: '2' },
      {
        campo: 'interaction',
        rotulo: 'Interação',
        exemplo: 'Ator segura na mão direita',
      },
    ],
  },
  {
    colecao: 'continuityWardrobe',
    titulo: 'Figurino',
    chave: 'character',
    rotuloDaChave: 'Personagem',
    exemplo: 'João',
    campos: [
      { campo: 'outfit', rotulo: 'Traje', exemplo: 'Camisa azul, calça jeans' },
      {
        campo: 'accessories',
        rotulo: 'Acessórios',
        exemplo: 'Relógio no pulso esquerdo',
      },
      { campo: 'state', rotulo: 'Estado', exemplo: 'Manga direita dobrada' },
    ],
  },
  {
    colecao: 'continuityHairMakeup',
    titulo: 'Cabelo e maquiagem',
    chave: 'character',
    rotuloDaChave: 'Personagem',
    exemplo: 'Maria',
    campos: [
      { campo: 'state', rotulo: 'Estado', exemplo: 'Cabelo preso, sem batom' },
      { campo: 'changes', rotulo: 'Alterações', exemplo: 'Suor acrescentado na testa' },
    ],
  },
  {
    colecao: 'continuitySetDressing',
    titulo: 'Cenografia',
    chave: 'element',
    rotuloDaChave: 'Elemento',
    exemplo: 'Quadro da parede',
    campos: [
      { campo: 'position', rotulo: 'Posição', exemplo: 'Torto para a esquerda' },
      { campo: 'state', rotulo: 'Estado', exemplo: 'Vidro trincado' },
    ],
  },
];

type ItemDeEstado = Record<string, unknown> & {
  id: string;
  sceneId?: string | null;
  setupId?: string | null;
  takeId?: string | null;
  _dirty?: 0 | 1;
};

/** O estado do set **da cena** — o nível onde a maior parte dos itens nasce. */
export function EstadoDaCena({
  productionId,
  sceneIds,
  canEdit,
}: {
  productionId: string;
  /** Todos os blocos da cena: um figurino da cena 24 vale para 24A e 24B. */
  sceneIds: string[];
  canEdit: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {COLECOES.map((definicao) => (
        <ColecaoDaCena
          key={definicao.colecao}
          definicao={definicao}
          productionId={productionId}
          sceneIds={sceneIds}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}

function ColecaoDaCena({
  definicao,
  productionId,
  sceneIds,
  canEdit,
}: {
  definicao: DefinicaoDaColecao;
  productionId: string;
  sceneIds: string[];
  canEdit: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [novo, setNovo] = useState('');

  const itens = useLiveQuery(
    () => listEstado(definicao.colecao, { sceneIds }),
    [definicao.colecao, sceneIds],
    [],
  ) as ItemDeEstado[];

  const resumo = itens
    .map((item) => String(item[definicao.chave] ?? ''))
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((valor) => !valor)}
        className={cn(
          'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-surface-hover',
          aberto && 'border-b border-line',
        )}
      >
        <span className="text-sm font-semibold text-zinc-200">{definicao.titulo}</span>
        <span className="flex-1" />
        <span className="truncate text-xs text-zinc-500">{resumo || 'Nada anotado'}</span>
        <ChevronDownIcon
          size={18}
          className={cn('shrink-0 text-zinc-400 transition', aberto && 'rotate-180')}
        />
      </button>

      {aberto ? (
        <div className="flex flex-col gap-3 p-3">
          {itens.map((item) => (
            <ItemEditavel
              key={item.id}
              definicao={definicao}
              item={item}
              canEdit={canEdit}
            />
          ))}

          {canEdit ? (
            <div className="flex items-end gap-2">
              <DebouncedTextField
                label={definicao.rotuloDaChave}
                className="flex-1"
                value={novo}
                placeholder={definicao.exemplo}
                onCommit={setNovo}
              />
              <Button
                variant="secondary"
                leftIcon={<PlusIcon size={16} />}
                disabled={!novo.trim()}
                onClick={async () => {
                  await createEstado(definicao.colecao, {
                    productionId,
                    // O primeiro bloco responde pela cena: o item vale para a cena
                    // inteira, e prendê-lo a um bloco só faria "24B" perder o figurino
                    // que "24A" anotou.
                    sceneId: sceneIds[0],
                    chave: novo,
                    campos: { [definicao.chave]: novo.trim() },
                  });
                  setNovo('');
                  syncNow();
                }}
              >
                Anotar
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ItemEditavel({
  definicao,
  item,
  canEdit,
}: {
  definicao: DefinicaoDaColecao;
  item: ItemDeEstado;
  canEdit: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-raised p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-zinc-100">
          {String(item[definicao.chave] ?? '—')}
        </span>
        {item.takeId ? <Badge tone="brand">deste take</Badge> : null}
        {item._dirty ? <Badge tone="muted">não enviado</Badge> : null}
        <span className="flex-1" />
        {canEdit ? (
          <IconButton
            label={`Remover ${String(item[definicao.chave] ?? 'item')}`}
            variant="danger"
            icon={<TrashIcon size={16} />}
            onClick={() => void removeEstado(definicao.colecao, item.id).then(syncNow)}
          />
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {definicao.campos.map((campo) => (
          <DebouncedTextField
            key={campo.campo}
            label={campo.rotulo}
            value={String(item[campo.campo] ?? '')}
            disabled={!canEdit}
            placeholder={campo.exemplo}
            onCommit={(valor) =>
              void patchEstado(definicao.colecao, item.id, {
                [campo.campo]: valor || null,
              }).then(syncNow)
            }
          />
        ))}
      </div>

      <DebouncedTextField
        label="Observações"
        value={String(item.notes ?? '')}
        disabled={!canEdit}
        onCommit={(valor) =>
          void patchEstado(definicao.colecao, item.id, { notes: valor || null }).then(
            syncNow,
          )
        }
      />
    </div>
  );
}

/**
 * O estado do set **neste take** — com herança de exibição (§4).
 *
 * Os itens da cena aparecem aqui sem virar linha nova: é isso que o documento chama de
 * "herança de exibição, sem cópia de linha". Copiar o figurino da cena para cada take
 * encheria o banco de repetição e, pior, faria corrigir o figurino significar corrigi-lo
 * em quarenta lugares.
 *
 * Quando o estado **muda** neste take — o copo que estava cheio e agora está pela metade —
 * um toque cria o registro próprio, com o mesmo nome e escopo de take. A partir daí os dois
 * convivem: o da cena continua valendo para os outros takes.
 */
export function EstadoDoTake({
  productionId,
  sceneId,
  setupId,
  takeId,
  canEdit,
}: {
  productionId: string;
  sceneId: string;
  setupId: string;
  takeId: string;
  canEdit: boolean;
}) {
  const [aberto, setAberto] = useState(false);

  const daCena = useLiveQuery(
    () =>
      Promise.all(
        COLECOES.map((definicao) =>
          listEstado(definicao.colecao, { sceneIds: [sceneId] }),
        ),
      ),
    [sceneId],
    [],
  ) as ItemDeEstado[][];

  const doTake = useLiveQuery(
    () =>
      Promise.all(
        COLECOES.map((definicao) =>
          listEstado(definicao.colecao, { setupIds: [setupId], takeIds: [takeId] }),
        ),
      ),
    [setupId, takeId],
    [],
  ) as ItemDeEstado[][];

  const total = (doTake ?? []).reduce((soma, lista) => soma + lista.length, 0);

  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((valor) => !valor)}
        className="flex min-h-[32px] w-full items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300"
      >
        <ChevronDownIcon size={14} className={cn('transition', aberto && 'rotate-180')} />
        Estado do set
        {total > 0 ? (
          <span className="text-zinc-400">{total} alterado(s) neste take</span>
        ) : null}
      </button>

      {aberto ? (
        <div className="mt-2 flex flex-col gap-3">
          {COLECOES.map((definicao, indice) => {
            const herdados = daCena?.[indice] ?? [];
            const proprios = doTake?.[indice] ?? [];

            if (herdados.length === 0 && proprios.length === 0) return null;

            return (
              <div key={definicao.colecao} className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {definicao.titulo}
                </p>

                {herdados.map((item) => {
                  const chave = String(item[definicao.chave] ?? '');
                  const jaAlterado = proprios.some(
                    (proprio) => String(proprio[definicao.chave] ?? '') === chave,
                  );

                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate text-zinc-300">
                        <span className="font-medium text-zinc-100">{chave}</span>
                        {item.state ? ` · ${String(item.state)}` : ''}
                      </span>
                      {jaAlterado ? (
                        <span className="shrink-0 text-zinc-500">alterado abaixo</span>
                      ) : canEdit ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await createEstado(definicao.colecao, {
                              productionId,
                              takeId,
                              chave,
                              campos: { [definicao.chave]: chave },
                            });
                            syncNow();
                          }}
                        >
                          Mudou aqui
                        </Button>
                      ) : null}
                    </div>
                  );
                })}

                {proprios.map((item) => (
                  <ItemEditavel
                    key={item.id}
                    definicao={definicao}
                    item={item}
                    canEdit={canEdit}
                  />
                ))}
              </div>
            );
          })}

          {(daCena ?? []).every((lista) => lista.length === 0) && total === 0 ? (
            <p className="text-xs text-zinc-500">
              Nada anotado na cena ainda. O que for anotado lá aparece aqui, e só vira
              registro deste take quando mudar.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
