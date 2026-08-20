import { defineConfig, devices } from '@playwright/test';

/**
 * O E2E da Fase 10 — e ele existe por duas provas que nenhum outro teste alcança:
 * **fechar o PWA e reabrir com o dado ainda lá**, e **duas abas em que o `liveQuery`
 * propaga sem recarregar**. As duas precisam de IndexedDB de verdade e de mais de uma
 * página viva; contra dublê, as duas passariam sem provar nada
 * ([synchronization.md §8](docs/architecture/synchronization.md#8-testes-obrigatórios)).
 *
 * Roda contra o **build de produção**, não contra `next dev`, por um motivo que é o
 * próprio objeto do teste: o Service Worker só é registrado em produção, e sem ele a
 * navegação offline não tem o que servir.
 *
 * Como `test:db`, `test:sala` e `test:sync`, exige `DATABASE_URL` e **não** entra em
 * `npm test` — o dia em que a suíte principal precisar de rede é o dia em que ela deixa
 * de ser rodada.
 */
const PORTA = Number(process.env.E2E_PORT ?? 3100);
const BASE = `http://localhost:${PORTA}`;

export default defineConfig({
  testDir: './test/e2e',
  globalSetup: './test/e2e/preparo.ts',
  globalTeardown: './test/e2e/limpeza.ts',
  // Os testes compartilham uma produção real no Neon: em paralelo, um apagaria a cena
  // que o outro acabou de criar, e a falha pareceria do sync.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE,
    storageState: './test/e2e/.artefatos/sessao.json',
    trace: 'retain-on-failure',
    // O produto é feito para telefone em locação: testá-lo numa janela de desktop
    // esconderia justamente os alvos de toque que a regra de 44px protege.
    ...devices['Pixel 7'],
  },

  projects: [{ name: 'chromium', use: { ...devices['Pixel 7'] } }],

  webServer: {
    command: `npm run build && npm run start -- --port ${PORTA}`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      // A Better Auth recusaria a origem do teste como CSRF se a base apontasse para
      // outra porta — o sintoma seria `403 INVALID_ORIGIN` no cadastro.
      BETTER_AUTH_URL: BASE,
      NEXT_PUBLIC_APP_URL: BASE,
    },
  },
});
