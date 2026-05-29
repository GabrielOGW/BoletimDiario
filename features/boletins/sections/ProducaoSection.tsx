'use client';

import type { Producao } from '@/types/boletim';
import { SectionCard } from '@/components/layout/SectionCard';
import { TextField } from '@/components/ui/TextField';
import { FilmIcon } from '@/components/ui/icons';

interface ProducaoSectionProps {
  value: Producao;
  onChange: (patch: Partial<Producao>) => void;
}

export function ProducaoSection({ value, onChange }: ProducaoSectionProps) {
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
          label="Diretor(a) de Fotografia"
          value={value.diretorFotografia}
          onChange={(v) => onChange({ diretorFotografia: v })}
        />
        <TextField
          label="Data"
          type="date"
          value={value.data}
          onChange={(v) => onChange({ data: v })}
        />
        <TextField
          label="Dia de Diária"
          value={value.diaDiaria}
          onChange={(v) => onChange({ diaDiaria: v })}
          inputMode="numeric"
          placeholder="Ex.: 04"
        />
      </div>
    </SectionCard>
  );
}
