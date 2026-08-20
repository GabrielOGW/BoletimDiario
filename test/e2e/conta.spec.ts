import { neon } from '@neondatabase/serverless';
import { config as carregaEnv } from 'dotenv';
import { expect, test } from '@playwright/test';

import { leFixture } from './fixture';

/**
 * A tela de aparelhos conectados, com uma sessão **velha**.
 *
 * Este arquivo existe por um defeito que passou pelos outros testes justamente por eles
 * serem rápidos: a conta do E2E nasce segundos antes de ser usada, então toda sessão que
 * eles exercitam é recém-criada.
 *
 * A Better Auth exige sessão "fresca" para listar sessões, e o padrão dela de frescor é
 * **um dia**. Aqui a sessão dura **90 dias e nunca é reverificada**, porque reverificar
 * quebraria o offline (ADR-025) — então, no uso real, a sessão de quem abre `/conta`
 * quase sempre tem mais de um dia. O efeito seria cruel: a tela que existe para derrubar
 * um telefone perdido é exatamente a que não abriria.
 *
 * O teste envelhece a sessão no banco e abre a tela.
 */

carregaEnv({ path: '.env' });

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

test('a conta abre com sessão velha, que é o caso normal aqui', async ({ page }) => {
  test.skip(!url, 'DATABASE_URL ausente.');

  const fixture = leFixture();
  const sql = neon(url!);

  // Três dias: passa do frescor padrão de um dia e fica longe dos 90 de expiração.
  const tresDiasAtras = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const envelhecidas = await sql`
    update sessions set created_at = ${tresDiasAtras}, updated_at = ${tresDiasAtras}
     where user_id = (select id from users where email = ${fixture.email})
    returning id
  `;
  expect(envelhecidas.length).toBeGreaterThan(0);

  await page.goto('/conta');

  await expect(page.getByRole('heading', { name: 'Minha conta' })).toBeVisible();
  await expect(page.getByText('Aparelhos conectados')).toBeVisible();
  // O aparelho atual aparece marcado e **sem** botão de desconectar: para sair dele
  // existe "Sair", que é outra coisa.
  await expect(page.getByText('este aparelho')).toBeVisible();
});
