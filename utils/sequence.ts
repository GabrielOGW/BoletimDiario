/**
 * Auto-progressão de Clip / Sync.
 *
 * Detecta o número no FINAL da string, preserva o prefixo e incrementa apenas
 * o sufixo numérico, mantendo a largura (zeros à esquerda):
 *   A002        → A003
 *   C012        → C013
 *   A005_C009   → A005_C010
 *   B_CAM_014   → B_CAM_015
 *   A099        → A100
 * Sem número no final (ex.: "MASTER"), retorna o valor inalterado.
 */
export function incrementSuffix(value: string): string {
  const match = value.match(/^(.*?)(\d+)$/);
  if (!match) return value;
  const prefix = match[1];
  const digits = match[2];
  const next = String(Number(digits) + 1).padStart(digits.length, '0');
  return `${prefix}${next}`;
}
