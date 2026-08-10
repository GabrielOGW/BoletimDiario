/**
 * Geração de IDs únicos sem dependências externas.
 *
 * O id é gerado **no cliente** e é definitivo: quando a plataforma existir, é ele que vira a
 * chave primária no Postgres (ADR-012). Por isso o fallback não pode ser fraco — um id
 * previsível ou repetível vira colisão de PK no servidor, onde não há como corrigir depois.
 * `crypto.randomUUID` exige contexto seguro; `crypto.getRandomValues` não, e existe em todo
 * ambiente relevante. Se nem ele existir, falhar é melhor que inventar um id ruim.
 */

const HEX = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, '0'));

/** UUID v4 a partir de 16 bytes aleatórios, com os campos de versão e variante corrigidos. */
function uuidFromRandomBytes(): string {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error(
      'Nenhuma fonte de aleatoriedade criptográfica disponível — não é possível gerar um id seguro.',
    );
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versão 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122

  const h = Array.from(bytes, (byte) => HEX[byte]);
  return [
    h.slice(0, 4).join(''),
    h.slice(4, 6).join(''),
    h.slice(6, 8).join(''),
    h.slice(8, 10).join(''),
    h.slice(10, 16).join(''),
  ].join('-');
}

export function uid(prefix = ''): string {
  const base =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : uuidFromRandomBytes();
  return prefix ? `${prefix}_${base}` : base;
}
