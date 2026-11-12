/**
 * Categorias das notas de raccord e das fotografias de continuidade (ADR-042).
 *
 * Sem React e sem Dexie, como as outras estruturas de módulo. As categorias são
 * **acelerador** e agrupamento no relatório, não validação: o banco guarda texto, e uma
 * categoria desconhecida sai impressa com o próprio código.
 */

export const CATEGORIAS_DE_NOTA = [
  { codigo: 'ATORES', rotulo: 'Posição dos atores' },
  { codigo: 'OLHAR', rotulo: 'Direção do olhar' },
  { codigo: 'ACAO', rotulo: 'Movimentação e ação' },
  { codigo: 'OBJETOS', rotulo: 'Objetos de cena' },
  { codigo: 'FIGURINO', rotulo: 'Figurino' },
  { codigo: 'CABELO_MAQUIAGEM', rotulo: 'Cabelo e maquiagem' },
  { codigo: 'DIALOGO', rotulo: 'Alteração de diálogo' },
  { codigo: 'MOVIMENTO_ENTRE_PLANOS', rotulo: 'Movimento entre planos' },
  { codigo: 'OUTRO', rotulo: 'Outro' },
] as const;

export const CATEGORIAS_DE_FOTO = [
  { codigo: 'OBJETOS', rotulo: 'Objetos' },
  { codigo: 'FIGURINO', rotulo: 'Figurino' },
  { codigo: 'CABELO_MAQUIAGEM', rotulo: 'Cabelo e maquiagem' },
  { codigo: 'ATORES', rotulo: 'Posição dos atores' },
  { codigo: 'COMPOSICAO', rotulo: 'Composição' },
  { codigo: 'OUTRO', rotulo: 'Outro' },
] as const;

const rotulos = (lista: readonly { codigo: string; rotulo: string }[]) =>
  new Map(lista.map((item) => [item.codigo, item.rotulo]));

const ROTULO_DE_NOTA = rotulos(CATEGORIAS_DE_NOTA);
const ROTULO_DE_FOTO = rotulos(CATEGORIAS_DE_FOTO);

export function rotuloDaCategoriaDeNota(codigo: string | null | undefined): string {
  const valor = String(codigo ?? '').trim();
  if (!valor) return 'Sem categoria';
  return ROTULO_DE_NOTA.get(valor) ?? valor;
}

export function rotuloDaCategoriaDeFoto(codigo: string | null | undefined): string {
  const valor = String(codigo ?? '').trim();
  if (!valor) return 'Sem categoria';
  return ROTULO_DE_FOTO.get(valor) ?? valor;
}

/** Onde uma nota ou foto está presa — "Cena 24", "Plano 24A/2", "Take 24A/2/3". */
export type NivelDoEscopo = 'CENA' | 'PLANO' | 'TAKE';

export function nivelDoEscopo(item: {
  sceneId?: string | null;
  setupId?: string | null;
  takeId?: string | null;
}): NivelDoEscopo {
  if (item.takeId) return 'TAKE';
  if (item.setupId) return 'PLANO';
  return 'CENA';
}
