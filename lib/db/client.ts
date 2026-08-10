/**
 * Cliente do Neon.
 *
 * `server-only` é a proteção que importa: `DATABASE_URL` nunca pode vazar para o
 * bundle do cliente, e um import acidental a partir de um componente cliente passaria
 * despercebido sem ele — quebrar o build é o comportamento desejado.
 *
 * Driver HTTP: ideal para route handlers curtos na Vercel, que é onde este cliente roda.
 *
 * **Ele não tem transação interativa** — `db.transaction()` lança "No transactions support
 * in neon-http driver". Para escritas que precisam ser atômicas mas não precisam do
 * resultado de uma consulta para decidir a próxima, use `db.batch([...])`: vai numa
 * requisição só e executa dentro de uma transação no servidor.
 *
 * Transação interativa de verdade exige o driver WebSocket (`drizzle-orm/neon-serverless`).
 * Quando o push de sincronização precisar dela, entra aqui como um **segundo** cliente —
 * não como substituição, porque o HTTP continua sendo o certo para o resto.
 */

import 'server-only';

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL não está definida. Copie .env.example e configure o Neon.',
  );
}

export const db = drizzle(neon(connectionString), { schema });

export { schema };
