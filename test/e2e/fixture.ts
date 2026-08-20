import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * O que o preparo cria e os testes leem.
 *
 * Vai para arquivo, e não para variável de ambiente, porque o `globalSetup`, cada worker
 * e o `globalTeardown` do Playwright são processos diferentes — uma variável exportada
 * num deles não existe nos outros.
 */
export interface Fixture {
  email: string;
  senha: string;
  productionId: string;
  shootingDayId: string;
  /** Data da diária, tirada do relógio do **aparelho** — nunca do banco (R9). */
  data: string;
}

const PASTA = join(process.cwd(), 'test', 'e2e', '.artefatos');

export const CAMINHO_SESSAO = join(PASTA, 'sessao.json');
const CAMINHO_FIXTURE = join(PASTA, 'fixture.json');

export function guardaFixture(fixture: Fixture): void {
  mkdirSync(dirname(CAMINHO_FIXTURE), { recursive: true });
  writeFileSync(CAMINHO_FIXTURE, JSON.stringify(fixture, null, 2));
}

export function leFixture(): Fixture {
  return JSON.parse(readFileSync(CAMINHO_FIXTURE, 'utf8')) as Fixture;
}

/** `2026-08-20` a partir do relógio local, que é o que `/hoje` também usa. */
export function hojeLocal(): string {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

export const rotaCamera = (fixture: Fixture): string =>
  `/p/${fixture.productionId}/diarias/${fixture.shootingDayId}/camera`;
