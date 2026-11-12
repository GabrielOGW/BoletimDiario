'use client';

import type { ReactNode } from 'react';

import { SectionCard } from '@/components/layout/SectionCard';
import { TextField } from '@/components/ui/TextField';
import { FilmIcon } from '@/components/ui/icons';
import type { ProducaoLocal } from '@/lib/local/comum';

/**
 * O cabeçalho de produção dos boletins locais de Som e Continuidade.
 *
 * Os mesmos campos e a mesma ordem da `ProducaoSection` do Boletim de Câmera — quem já
 * preenche um boletim de câmera preenche este sem pensar (ADR-024). Sem sala e sem diária:
 * é texto digitado, como no caderno.
 */
export function ProducaoLocalSection({
  value,
  onChange,
  children,
}: {
  value: ProducaoLocal;
  onChange: (patch: Partial<ProducaoLocal>) => void;
  /** Campos do departamento que moram no mesmo cartão (continuísta, por exemplo). */
  children?: ReactNode;
}) {
  return (
    <SectionCard title="Produção" icon={<FilmIcon size={18} />}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField
          label="Produtora"
          value={value.produtora}
          onChange={(v) => onChange({ produtora: v })}
          className="sm:col-span-2"
        />
        <TextField
          label="Título do Projeto"
          value={value.tituloProjeto}
          onChange={(v) => onChange({ tituloProjeto: v })}
          className="sm:col-span-2"
        />
        <TextField
          label="Diretor(a)"
          value={value.diretor}
          onChange={(v) => onChange({ diretor: v })}
        />
        <TextField
          label="Locação"
          value={value.locacao}
          onChange={(v) => onChange({ locacao: v })}
        />
        <TextField
          label="Data"
          type="date"
          value={value.data}
          onChange={(v) => onChange({ data: v })}
        />
        <TextField
          label="Dia de Diária"
          value={value.diaria}
          onChange={(v) => onChange({ diaria: v })}
          inputMode="numeric"
          placeholder="Ex.: 04"
        />
        {children}
      </div>
    </SectionCard>
  );
}
