/**
 * Banco local zerado entre um teste e outro.
 *
 * Apagar o banco inteiro e reabrir seria mais simples e está errado: `getDb()` guarda a
 * instância num módulo, e o Dexie da instância antiga continuaria apontando para um
 * banco que não existe mais. Limpar as tabelas mantém a mesma conexão viva.
 */
import { getDb } from '@/lib/offline/db';

export async function limpaBanco(): Promise<void> {
  const db = getDb();
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
}
