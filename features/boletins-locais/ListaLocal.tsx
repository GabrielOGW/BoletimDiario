'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { IconButton } from '@/components/ui/IconButton';
import { CopyIcon, EyeIcon, TrashIcon } from '@/components/ui/icons';
import { useListaLocal } from '@/hooks/useBoletimLocal';
import { tituloDoBoletim } from '@/lib/local/comum';
import {
  duplicaBoletimContinuidade,
  resumoContinuidade,
  type BoletimContinuidade,
} from '@/lib/local/continuidade';
import { apagaFotosDoBoletim, copiaFotos } from '@/lib/local/fotos';
import { duplicaBoletimSom, resumoSom, type BoletimSom } from '@/lib/local/som';
import { storeContinuidade, storeSom } from '@/lib/local/store';
import { CartaoDeBoletim } from '@/features/boletins/CartaoDeBoletim';
import { formatDateBR } from '@/utils/date';

import {
  definicaoDoModulo,
  editorLocalDoModulo,
  folhaLocalDoModulo,
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
 * Duplica um boletim local, como o "Duplicar" da Câmera: todos os ids novos e "(cópia)"
 * no título. Na Continuidade, os bytes das fotos são copiados **antes** de gravar a cópia —
 * assim ela nunca existe apontando para fotos que ainda não estão lá.
 */
async function duplica(item: Item): Promise<void> {
  if (item.modulo === 'som') {
    const original = storeSom.getById(item.id);
    if (original) storeSom.upsert(duplicaBoletimSom(original));
    return;
  }
  if (item.modulo === 'continuidade') {
    const original = storeContinuidade.getById(item.id);
    if (!original) return;
    const { copia, fotos } = duplicaBoletimContinuidade(original);
    await copiaFotos(fotos, copia.id).catch(() => undefined);
    storeContinuidade.upsert(copia);
  }
}

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
 * O cartão é o mesmo da Câmera (`CartaoDeBoletim`): faixa de cor e nome do departamento.
 */
export function ListaLocal({ itens }: { itens: Item[] }) {
  const router = useRouter();
  const [apagando, setApagando] = useState<Item | null>(null);

  if (itens.length === 0) return null;

  return (
    <section aria-label="Boletins de som e continuidade" className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {itens.map((item) => (
          <CartaoDeBoletim
            key={item.id}
            modulo={item.modulo}
            href={editorLocalDoModulo(item.modulo, item.id)}
            titulo={item.titulo}
            resumo={item.linha}
            acoes={
              <>
                <IconButton
                  label={`Ver folha de ${item.titulo}`}
                  icon={<EyeIcon size={17} />}
                  onClick={() => router.push(folhaLocalDoModulo(item.modulo, item.id))}
                />
                <IconButton
                  label={`Duplicar ${item.titulo}`}
                  icon={<CopyIcon size={17} />}
                  onClick={() => void duplica(item)}
                />
                <IconButton
                  label={`Excluir ${definicaoDoModulo(item.modulo)?.nome ?? 'boletim'} ${item.titulo}`}
                  variant="danger"
                  icon={<TrashIcon size={16} />}
                  onClick={() => setApagando(item)}
                />
              </>
            }
          />
        ))}
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
