/** Helpers de data/hora em pt-BR, tolerantes a valores vazios. */

/** Data de hoje no formato aceito por <input type="date"> (YYYY-MM-DD). */
export function todayISODate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Formata uma data ISO (YYYY-MM-DD) como DD/MM/YYYY. Retorna '—' se vazio. */
export function formatDateBR(iso: string): string {
  if (!iso) return '—';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

/** Formata um timestamp ISO completo como DD/MM/YYYY HH:mm. */
export function formatDateTimeBR(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Timestamp legível e seguro para nome de arquivo (YYYY-MM-DD_HH-mm). */
export function fileStamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}`
  );
}
