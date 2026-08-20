import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { neon } from '@neondatabase/serverless';
import { config as carregaEnv } from 'dotenv';

import { leFixture } from './fixture';

/**
 * Apaga a produção e a conta que o preparo criou.
 *
 * A produção sai por cascata — cena, setup, take e os `*TakeData` vão junto. O que não
 * pode sobrar é a conta: um banco de desenvolvimento com trezentas contas `e2e-…` deixa
 * a tela de membros inútil para quem estiver testando à mão.
 */
export default async function limpeza(): Promise<void> {
  carregaEnv({ path: '.env' });

  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) return;

  try {
    const { productionId, email } = leFixture();
    const sql = neon(url);
    await sql`delete from productions where id = ${productionId}`;
    await sql`delete from users where email = ${email}`;
  } catch {
    // Preparo que nem chegou a gravar o fixture não deixou nada para apagar.
  } finally {
    rmSync(join(process.cwd(), 'test', 'e2e', '.artefatos'), {
      recursive: true,
      force: true,
    });
  }
}
