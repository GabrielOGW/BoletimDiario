import { loadAll, replaceAll } from '@/lib/storage';

const MIGRATION_FLAG = 'bdc:migrated:v2';

/**
 * Migração proativa v1 → v2, executada uma única vez no boot.
 *
 * `loadAll()` já normaliza/migra tudo em memória; `replaceAll()` regrava no novo
 * formato (sem alterar `updatedAt`). A normalização é idempotente, então mesmo
 * sem o flag nada quebraria — o flag só evita reescrever a base toda vez.
 */
export function runMigrations(): void {
  if (typeof window === 'undefined') return;
  if (window.localStorage.getItem(MIGRATION_FLAG)) return;
  const all = loadAll();
  if (all.length > 0) replaceAll(all);
  window.localStorage.setItem(MIGRATION_FLAG, 'true');
}
