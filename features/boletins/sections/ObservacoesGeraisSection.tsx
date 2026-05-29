'use client';

import { SectionCard } from '@/components/layout/SectionCard';
import { TextAreaField } from '@/components/ui/TextAreaField';
import { FileTextIcon } from '@/components/ui/icons';

interface ObservacoesGeraisSectionProps {
  value: string;
  onChange: (value: string) => void;
}

export function ObservacoesGeraisSection({
  value,
  onChange,
}: ObservacoesGeraisSectionProps) {
  return (
    <SectionCard title="Observações Gerais" icon={<FileTextIcon size={18} />}>
      <TextAreaField
        label="Notas do dia"
        value={value}
        onChange={onChange}
        rows={5}
        placeholder="Problemas técnicos, equipamentos, notas para a próxima diária…"
      />
    </SectionCard>
  );
}
