import { cn } from '@/utils/cn';

import { definicaoDoModulo, type ModuloDeDepartamento } from './departamentos';

/**
 * A faixa de cor do departamento, logo abaixo do cabeçalho do módulo (ADR-040).
 *
 * Decorativa de propósito (`aria-hidden`): o título do cabeçalho já diz "Boletim de Som"
 * por extenso. A faixa é o que deixa reconhecer o módulo de relance, com o celular a meio
 * metro, entre dois takes — nunca o que o identifica sozinha.
 */
export function FaixaDoDepartamento({ modulo }: { modulo: ModuloDeDepartamento }) {
  const definicao = definicaoDoModulo(modulo);
  if (!definicao) return null;
  return <div aria-hidden className={cn('h-1 w-full', definicao.cor.faixa)} />;
}
