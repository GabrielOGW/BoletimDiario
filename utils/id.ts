/**
 * Geração de IDs únicos sem dependências externas.
 * Usa crypto.randomUUID quando disponível, com fallback robusto.
 */
export function uid(prefix = ''): string {
  const base =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${base}` : base;
}
