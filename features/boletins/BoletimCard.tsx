'use client';

import type { Boletim } from '@/types/boletim';
import { boletimTitle, computeStats } from '@/utils/boletim-stats';
import { formatDateBR } from '@/utils/date';
import { IconButton } from '@/components/ui/IconButton';
import { CopyIcon, EyeIcon, TrashIcon } from '@/components/ui/icons';

import { CartaoDeBoletim } from './CartaoDeBoletim';

interface BoletimCardProps {
  boletim: Boletim;
  onView: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/**
 * O Boletim de Câmera na lista — no mesmo cartão compacto de Som e Continuidade, com a
 * faixa amarela da Câmera. As três ações de sempre continuam: ver a folha, duplicar e
 * excluir; tocar no cartão abre o editor, como antes.
 */
export function BoletimCard({
  boletim,
  onView,
  onDuplicate,
  onDelete,
}: BoletimCardProps) {
  const stats = computeStats(boletim);
  const titulo = boletimTitle(boletim);

  const resumo = [
    formatDateBR(boletim.producao.data),
    boletim.producao.diaDiaria ? `Diária ${boletim.producao.diaDiaria}` : '',
    `${stats.totalTakes} take(s)`,
    stats.takesAprovados ? `${stats.takesAprovados} aprovado(s)` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <CartaoDeBoletim
      modulo="camera"
      href={`/legado/editar?id=${boletim.id}`}
      titulo={titulo}
      resumo={resumo}
      acoes={
        <>
          <IconButton
            label={`Ver folha de ${titulo}`}
            icon={<EyeIcon size={17} />}
            onClick={onView}
          />
          <IconButton
            label={`Duplicar ${titulo}`}
            icon={<CopyIcon size={17} />}
            onClick={onDuplicate}
          />
          <IconButton
            label={`Excluir ${titulo}`}
            variant="danger"
            icon={<TrashIcon size={16} />}
            onClick={onDelete}
          />
        </>
      }
    />
  );
}
