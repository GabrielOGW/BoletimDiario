import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { chromium, type FullConfig } from '@playwright/test';

import { CAMINHO_SESSAO, guardaFixture, hojeLocal } from './fixture';

/**
 * Conta, produção e diária de verdade, criadas **pela interface**.
 *
 * Inseri-las direto no banco seria mais rápido e provaria menos: metade do que a Fase 3
 * entregou é a regra que roda no caminho do formulário — papel, departamento, membresia.
 * O que se quer aqui é uma diária que existe do mesmo jeito que a de um set existe.
 *
 * Roda uma vez, e o que sobra é a sessão gravada em disco: os testes não repetem o
 * login, que não é o que eles estão provando.
 */
export default async function preparo(config: FullConfig): Promise<void> {
  const base = config.projects[0].use.baseURL ?? 'http://localhost:3100';

  const carimbo = Date.now();
  const email = `e2e-${carimbo}@boletim.local`;
  const senha = `senha-forte-${carimbo}`;
  const data = hojeLocal();

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();

  // ---- conta ----
  await page.goto('/cadastro');
  await page.getByLabel('Nome').fill('Assistente de Câmera');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.waitForURL('**/producoes');

  // ---- produção ----
  // O cartão "Criar produção" nasce fechado, e o cabeçalho que o abre tem o mesmo nome
  // acessível do botão de enviar — daí escopar tudo ao formulário.
  await page.getByRole('button', { name: 'Criar produção' }).first().click();

  const formulario = page
    .locator('form')
    .filter({ has: page.getByLabel('Nome da produção') });
  await formulario.getByLabel('Nome da produção').fill(`E2E ${carimbo}`);
  await formulario.getByLabel('Seu departamento').selectOption('CAMERA');
  await formulario.getByRole('button', { name: 'Criar produção' }).click();
  await page.waitForURL(/\/p\/[0-9a-f-]{36}/);

  const productionId = new URL(page.url()).pathname.split('/')[2];

  // ---- diária ----
  await page.goto(`/p/${productionId}/diarias/nova`);
  await page.getByLabel('Data').fill(data);
  await page.getByLabel('Diária nº').fill('1');
  await page.getByRole('button', { name: 'Criar diária' }).click();
  // A ação redireciona para a lista **sem** `/nova`: parar em `/nova` significa que o
  // formulário recusou os dados, e seguir daí daria um 404 lá na frente, sem relação
  // aparente com o preparo.
  await page.waitForURL(`${base}/p/${productionId}/diarias`);

  const hrefs = await page
    .locator(`a[href^="/p/${productionId}/diarias/"]`)
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));

  // "Nova diária" mora no mesmo prefixo; o que distingue a diária é o id.
  const daDiaria = hrefs.find((href) => /\/[0-9a-f-]{36}$/.test(href));
  const shootingDayId = daDiaria?.split('/').pop() ?? '';

  if (!shootingDayId) {
    throw new Error(
      `O preparo não achou a diária recém-criada. Links: ${hrefs.join(', ')}`,
    );
  }

  mkdirSync(dirname(CAMINHO_SESSAO), { recursive: true });
  await context.storageState({ path: CAMINHO_SESSAO });
  guardaFixture({ email, senha, productionId, shootingDayId, data });

  await browser.close();
}
