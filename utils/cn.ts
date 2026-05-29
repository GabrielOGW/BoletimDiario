/**
 * Concatenador de classes condicional minimalista (sem dependências).
 * Aceita strings, falsy e objetos { classe: condição }.
 */
type ClassValue = string | number | null | false | undefined | Record<string, boolean>;

export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  for (const value of values) {
    if (!value) continue;
    if (typeof value === 'string' || typeof value === 'number') {
      out.push(String(value));
    } else {
      for (const [key, active] of Object.entries(value)) {
        if (active) out.push(key);
      }
    }
  }
  return out.join(' ');
}
