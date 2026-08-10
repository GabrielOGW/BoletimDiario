import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env' });

/**
 * `drizzle-kit generate` produz SQL versionado e legível em `drizzle/`. Esse SQL é a
 * fonte executável do schema — não o DDL de `docs/architecture/database.md`.
 *
 * Usa a conexão **não-pooled**: DDL não deve passar pelo pooler.
 */
export default defineConfig({
  schema: './lib/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
