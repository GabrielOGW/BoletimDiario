/**
 * Compressão de foto no aparelho, antes de qualquer gravação (ADR-042).
 *
 * Uma foto de celular tem 3–8 MB; a de continuidade precisa mostrar onde está o copo, não
 * os poros do ator. Comprimida aqui — JPEG, lado maior de 1600 px — ela cai para
 * 150–400 KB, e é esse tamanho que vai para o IndexedDB, para a fila e para o servidor.
 * Comprimir no servidor seria pagar o upload inteiro num 4G de locação.
 *
 * Sem biblioteca: `createImageBitmap` + `<canvas>` existem em todo navegador alvo, e a
 * orientação EXIF é aplicada pelo próprio `createImageBitmap`.
 */

export const LADO_MAXIMO = 1600;
export const QUALIDADE_JPEG = 0.75;

/** As dimensões finais, sem ampliar nunca e mantendo a proporção. Pura — testável. */
export function dimensoesAlvo(
  largura: number,
  altura: number,
  maximo: number = LADO_MAXIMO,
): { largura: number; altura: number } {
  if (largura <= 0 || altura <= 0) return { largura: 0, altura: 0 };
  const escala = Math.min(1, maximo / Math.max(largura, altura));
  return {
    largura: Math.max(1, Math.round(largura * escala)),
    altura: Math.max(1, Math.round(altura * escala)),
  };
}

export interface ImagemComprimida {
  bytes: ArrayBuffer;
  mimeType: string;
  largura: number;
  altura: number;
}

export async function comprimeImagem(arquivo: Blob): Promise<ImagemComprimida> {
  const bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  const { largura, altura } = dimensoesAlvo(bitmap.width, bitmap.height);

  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const contexto = canvas.getContext('2d');
  if (!contexto) throw new Error('Este aparelho não conseguiu processar a foto.');

  contexto.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALIDADE_JPEG),
  );
  if (!blob) throw new Error('Este aparelho não conseguiu processar a foto.');

  return { bytes: await blob.arrayBuffer(), mimeType: 'image/jpeg', largura, altura };
}

/**
 * Cabe mais uma foto deste tamanho sem apertar o banco local?
 *
 * Recusa quando o uso passaria de 90% da cota: o que sobra é do texto da diária, que é o
 * que não pode faltar. Sem a API (navegador antigo), deixa passar — a escrita no
 * IndexedDB ainda falha com erro de cota, e esse erro chega à tela.
 */
export async function cabeNoAparelho(bytes: number): Promise<boolean> {
  try {
    const estimativa = await navigator.storage?.estimate?.();
    if (!estimativa?.quota || estimativa.usage === undefined) return true;
    return (estimativa.usage + bytes) / estimativa.quota < 0.9;
  } catch {
    return true;
  }
}

/**
 * Pede ao navegador para não despejar o banco local sob pressão de espaço.
 *
 * Com fotos, o IndexedDB passa a ser grande o bastante para ser candidato a despejo (R5).
 * O pedido é silencioso e pode ser negado; quando é, nada muda — as fotos continuam
 * subindo para o servidor no próximo sinal.
 */
export async function pedePersistencia(): Promise<void> {
  try {
    if (await navigator.storage?.persisted?.()) return;
    await navigator.storage?.persist?.();
  } catch {
    // Sem a API, sem pedido.
  }
}
