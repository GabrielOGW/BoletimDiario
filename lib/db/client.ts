/**
 * Cliente do Neon.
 *
 * `server-only` é a proteção que importa: `DATABASE_URL` nunca pode vazar para o
 * bundle do cliente, e um import acidental a partir de um componente cliente passaria
 * despercebido sem ele — quebrar o build é o comportamento desejado.
 *
 * Driver HTTP: ideal para route handlers curtos na Vercel, que é onde este cliente roda.
 * Transação de várias instruções exige o driver WebSocket; quando isso for necessário
 * (push de sync em lote), entra aqui como um segundo cliente, não como substituição.
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
