'use client';

import Link from 'next/link';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { IconButton } from '@/components/ui/IconButton';
import { TrashIcon } from '@/components/ui/icons';
import { useListaLocal } from '@/hooks/useBoletimLocal';
import { tituloDoBoletim } from '@/lib/local/comum';
import { resumoContinuidade, type BoletimContinuidade } from '@/lib/local/continuidade';
import { apagaFotosDoBoletim } from '@/lib/local/fotos';
import { resumoSom, type BoletimSom } from '@/lib/local/som';
import { storeContinuidade, storeSom } from '@/lib/local/store';
import { cn } from '@/utils/cn';
import { formatDateBR } from '@/utils/date';

import {
  definicaoDoModulo,
  editorLocalDoModulo,
  type ModuloDeDepartamento,
} from '@/features/diaria/departamentos';

interface Item {
  id: string;
  modulo: ModuloDeDepartamento;
  titulo: string;
  linha: string;
  updatedAt: string;
}

function itemDeSom(boletim: BoletimSom): Item {
  const resumo = resumoSom(boletim);
  return {
    id: boletim.id,
    modulo: 'som',
    titulo: tituloDoBoletim(boletim),
    linha: [
      formatDateBR(boletim.producao.data),
      `${resumo.takes} take(s)`,
      resumo.circled ? `${resumo.circled} circled` : '',
      resumo.comProblema ? `${resumo.comProblema} com problema` : '',
    ]
      .filter(Boolean)
      .join(' · '),
    updatedAt: boletim.updatedAt,
  };
}

function itemDeContinuidade(boletim: BoletimContinuidade): Item {
  const resumo = resumoContinuidade(boletim);
  return {
    id: boletim.id,
    modulo: 'continuidade',
    titulo: tituloDoBoletim(boletim),
    linha: [
      formatDateBR(boletim.producao.data),
      `${resumo.takes} take(s)`,
      resumo.prints ? `${resumo.prints} print` : '',
      resumo.fotos ? `${resumo.fotos} foto(s)` : '',
    ]
      .filter(Boolean)
      .join(' · '),
    updatedAt: boletim.updatedAt,
  };
}

const casa = (item: Item, query: string) => {
  const termos = query.toLowerCase().split(/\s+/).filter(Boolean);
  const texto =
    `${item.titulo} ${item.linha} ${definicaoDoModulo(item.modulo)?.nome ?? ''}`.toLowerCase();
  return termos.every((termo) => texto.includes(termo));
};

export type ItemLocal = Item;

/**
 * Os boletins locais de Som e Continuidade: o total (para a tela vazia) e os que casam com
 * a busca — a mesma regra da lista de câmera, toda palavra precisa aparecer.
 */
export function useItensLocais(query: string): { total: number; itens: Item[] } {
  const som = useListaLocal(storeSom);
  const continuidade = useListaLocal(storeContinuidade);
  const todos = [
    ...som.lista.map(itemDeSom),
    ...continuidade.lista.map(itemDeContinuidade),
  ];
  return {
    total: todos.length,
    itens: todos
      .filter((item) => casa(item, query))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
}

/**
 * Os boletins locais de Som e Continuidade na tela inicial (ADR-043), logo abaixo dos de
 * Câmera — a lista de câmera continua exatamente como era.
 *
 * Cada cartão diz o departamento por extenso e leva a faixa de cor dele.
 */
export function ListaLocal({ itens }: { itens: Item[] }) {
  const [apagando, setApagando] = useState<Item | null>(null);

  if (itens.length === 0) return null;

  return (
    <section aria-label="Boletins de som e continuidade" className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {itens.map((item) => {
          const definicao = definicaoDoModulo(item.modulo);
          return (
            <li
              key={item.id}
              className={cn(
                'flex items-stretch overflow-hidden rounded-2xl border bg-surface',
                definicao?.cor.borda,
              )}
            >
              <span aria-hidden className={cn('w-1.5 shrink-0', definicao?.cor.faixa)} />
              <Link
                href={editorLocalDoModulo(item.modulo, item.id)}
                className="min-w-0 flex-1 px-4 py-3 transition hover:bg-surface-hover"
              >
                <span
                  className={cn(
                    'block text-xs font-semibold uppercase tracking-wide',
                    definicao?.cor.texto,
                  )}
                >
                  {definicao?.nome}
                </span>
                <span className="block truncate text-[15px] font-semibold text-zinc-100">
                  {item.titulo}
                </span>
                <span className="block truncate text-xs text-zinc-400">{item.linha}</span>
              </Link>
              <div className="flex items-center pr-2">
                <IconButton
                  label={`Excluir ${definicao?.nome ?? 'boletim'} ${item.titulo}`}
                  variant="danger"
                  icon={<TrashIcon size={16} />}
                  onClick={() => setApagando(item)}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={apagando !== null}
        title="Excluir boletim?"
        description={
          apagando
            ? `"${apagando.titulo}" (${definicaoDoModulo(apagando.modulo)?.nome}) será removido deste aparelho. Esta ação não pode ser desfeita.`
            : ''
        }
        confirmLabel="Excluir"
        destructive
        onConfirm={() => {
          if (apagando?.modulo === 'som') storeSom.remove(apagando.id);
          if (apagando?.modulo === 'continuidade') {
            storeContinuidade.remove(apagando.id);
            void apagaFotosDoBoletim(apagando.id).catch(() => undefined);
          }
          setApagando(null);
        }}
        onCancel={() => setApagando(null)}
      />
    </section>
  );
}
