import { expect, test, type Locator, type Page } from '@playwright/test';

import { CAMINHO_SESSAO, leFixture, rotaCamera, type Fixture } from './fixture';

/**
 * O ciclo de vida do PWA em locação.
 *
 * As duas provas deste arquivo são as duas linhas que sobraram sem marca em
 * [synchronization.md §8](../../docs/architecture/synchronization.md#8-testes-obrigatórios)
 * desde a Fase 4, e por um motivo honesto: elas exigem IndexedDB de verdade e mais de uma
 * página viva. Contra dublê, passariam sem provar nada.
 *
 * O que está em jogo é a promessa central do produto — **nada dentro da fronteira exige
 * rede para editar** (ADR-016). Se ela falhar, falha calada: a tela mostra o dado, o
 * assistente segue anotando, e a perda só aparece no dia seguinte.
 */

let fixture: Fixture;

test.beforeAll(() => {
  fixture = leFixture();
});

/**
 * Cada teste trabalha na **sua** cena, e o número vem do relógio.
 *
 * A produção é uma só e o banco é real: dois testes na mesma cena disputariam a numeração
 * de plano e de take, e a falha apareceria como se fosse do sync. Um contador de módulo
 * não serve — o Playwright reinicia o worker depois de um teste que falha, e o contador
 * voltaria ao início bem no momento em que a isolação mais importa.
 */
const cenaNova = (): string => String(Date.now()).slice(-6);

/**
 * Abre a diária **com rede**, do jeito que ela é aberta na base antes de subir a serra.
 *
 * O `reload` não é paranoia: a primeiríssima navegação de um aparelho acontece **antes**
 * de o Service Worker assumir o controle, então ela não passa por ele e não entra no
 * cache de runtime. Sem essa segunda visita, ficar offline e recarregar cairia no
 * fallback do app shell — que é o boletim local, e não a diária.
 */
async function abreCamera(page: Page): Promise<void> {
  await page.goto(rotaCamera(fixture));
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();

  await expect(page.getByRole('button', { name: 'Cena', exact: true })).toBeVisible({
    timeout: 30_000,
  });

  // Se isto falhar, o que quebrou foi o Service Worker, e não o banco local — vale a
  // asserção separada para a próxima pessoa não procurar no lugar errado.
  const emCache = await page.evaluate(
    async (url) => Boolean(await caches.match(url, { ignoreSearch: true })),
    page.url(),
  );
  expect(emCache, 'a rota da diária precisa estar no cache do Service Worker').toBe(true);
}

/** Cena → plano → take: o mínimo para haver onde anotar. Devolve o cartão da cena. */
async function preparaTake(page: Page, numero: string): Promise<Locator> {
  await page.getByRole('button', { name: 'Cena', exact: true }).click();
  await page.getByLabel('Nº', { exact: true }).fill(numero);
  await page.getByRole('button', { name: 'Criar', exact: true }).click();

  const cena = page
    .locator('section')
    .filter({ hasText: `Cena ${numero}` })
    .last();
  await expect(cena).toBeVisible();

  await cena.getByRole('button', { name: 'Adicionar plano' }).click();
  await cena.getByRole('button', { name: 'Adicionar take' }).click();
  await expect(cena.getByText('Take 1')).toBeVisible();

  return cena;
}

const cenaNa = (page: Page, numero: string): Locator =>
  page
    .locator('section')
    .filter({ hasText: `Cena ${numero}` })
    .last();

/**
 * A nota já está gravada no banco local? Lido do IndexedDB de verdade.
 *
 * É o sinal que separa "digitei" de "gravou": o auto-save é de 500 ms e não há botão
 * salvar, então fechar a página antes do commit perderia as últimas teclas — o que é o
 * contrato, e não o que este teste quer provar. O que ele quer provar é que **o que já
 * foi gravado** sobrevive a fechar o app.
 */
async function gravadaLocalmente(page: Page, nota: string): Promise<boolean> {
  return page.evaluate(
    (procurada) =>
      new Promise<boolean>((resolve, reject) => {
        const abertura = indexedDB.open('bdc-platform');
        abertura.onerror = () => reject(abertura.error);
        abertura.onsuccess = () => {
          const db = abertura.result;
          const pedido = db
            .transaction('cameraTakeData')
            .objectStore('cameraTakeData')
            .getAll();
          pedido.onsuccess = () => {
            resolve(
              (pedido.result as { notes?: string | null }[]).some(
                (linha) => linha?.notes === procurada,
              ),
            );
            db.close();
          };
          pedido.onerror = () => reject(pedido.error);
        };
      }),
    nota,
  );
}

test('o take anotado offline continua lá depois de fechar e reabrir o app', async ({
  page,
  context,
}) => {
  const numero = cenaNova();

  await abreCamera(page);
  const cena = await preparaTake(page, numero);

  // A rota precisa ter sido visitada com rede uma vez: é isso que a coloca no cache de
  // runtime do Service Worker. Fora do teste, é o "abrir a diária ainda na base".
  await context.setOffline(true);

  const nota = 'foco escapou no meio — anotado offline';
  await cena.getByRole('textbox', { name: 'Nota operacional' }).fill(nota);
  await expect.poll(() => gravadaLocalmente(page, nota)).toBe(true);
  await expect(cena.getByText('não enviado').first()).toBeVisible();

  // Fechar a página é o que acontece quando o telefone volta para o bolso e o sistema
  // recolhe a aba — o caso em que "o dado ainda não tinha saído" custaria a diária.
  await page.close();

  const reaberta = await context.newPage();
  await reaberta.goto(rotaCamera(fixture));

  const depois = cenaNa(reaberta, numero);
  await expect(depois.getByRole('textbox', { name: 'Nota operacional' })).toHaveValue(
    nota,
    { timeout: 30_000 },
  );
  // Continua marcado como não enviado: reabrir não é sincronizar.
  await expect(depois.getByText('não enviado').first()).toBeVisible();
});

test('quando a rede volta, o que ficou na fila chega ao outro aparelho', async ({
  page,
  context,
  browser,
}) => {
  const numero = cenaNova();

  await abreCamera(page);
  const cena = await preparaTake(page, numero);

  await context.setOffline(true);
  const nota = `nota da diária ${Date.now()}`;
  await cena.getByRole('textbox', { name: 'Nota operacional' }).fill(nota);
  await expect.poll(() => gravadaLocalmente(page, nota)).toBe(true);
  await expect(cena.getByText('não enviado').first()).toBeVisible();

  await context.setOffline(false);
  // O motor empurra sozinho ao voltar a ficar visível e no evento `online`; a marca de
  // pendência sumir é o sinal de que o push foi aceito.
  await expect(cena.getByText('não enviado')).toHaveCount(0, { timeout: 60_000 });

  // Outro aparelho: contexto novo, IndexedDB vazio, mesma conta.
  const outro = await browser.newContext({ storageState: CAMINHO_SESSAO });
  const paginaDoOutro = await outro.newPage();
  await paginaDoOutro.goto(rotaCamera(fixture));

  await expect(
    cenaNa(paginaDoOutro, numero).getByRole('textbox', { name: 'Nota operacional' }),
  ).toHaveValue(nota, { timeout: 60_000 });
  await outro.close();
});

test('o liveQuery propaga entre duas abas sem ninguém recarregar', async ({
  page,
  context,
}) => {
  const numero = cenaNova();

  await abreCamera(page);
  const cena = await preparaTake(page, numero);

  const segunda = await context.newPage();
  await segunda.goto(rotaCamera(fixture));
  const naSegunda = cenaNa(segunda, numero);
  await expect(naSegunda.getByText('Take 1')).toBeVisible({ timeout: 30_000 });

  // A segunda aba não recarrega em nenhum momento daqui para baixo.
  await cena.getByRole('button', { name: 'Adicionar take' }).click();

  // Reatividade entre abas é o motivo declarado de o banco local ser Dexie e não
  // IndexedDB cru: sem ela, a folha aberta numa aba mentiria sobre o dia.
  await expect(naSegunda.getByText('Take 2')).toBeVisible({ timeout: 30_000 });
});
