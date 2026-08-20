/**
 * A prova de que escrita local e fila são **uma** transação.
 *
 * Está num arquivo só dela porque exige substituir o `enqueue` por um que falha, e um
 * dublê assim não pode vazar para os outros testes. O que se prova: se o enfileiramento
 * quebra, a escrita local **volta atrás**.
 *
 * O contrário — gravar e não enfileirar — é o pior defeito possível nesta camada: em set
 * a tela mostra o dado, ninguém desconfia de nada, e o servidor nunca recebe. O erro só
 * aparece no dia seguinte, quando a montagem procura o take e ele não existe.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDb } from '@/lib/offline/db';

import { limpaBanco } from './db-limpo';

const PRODUCAO = '11111111-1111-4111-8111-111111111111';

vi.mock('@/lib/offline/outbox', async (original) => {
  const real = await original<typeof import('@/lib/offline/outbox')>();
  return { ...real, enqueue: vi.fn(real.enqueue) };
});

const { enqueue } = await import('@/lib/offline/outbox');
const { createScene, patchEntity } = await import('@/lib/offline/repos/diaria');
const dublê = vi.mocked(enqueue);

beforeEach(async () => {
  await limpaBanco();
  dublê.mockClear();
  dublê.mockImplementation(
    (await vi.importActual<typeof import('@/lib/offline/outbox')>('@/lib/offline/outbox'))
      .enqueue,
  );
});

describe('escrita local e fila de saída', () => {
  it('desfaz a criação quando o enfileiramento falha', async () => {
    dublê.mockRejectedValueOnce(new Error('IndexedDB cheio'));

    await expect(createScene({ productionId: PRODUCAO, number: '12' })).rejects.toThrow();

    // Nem a cena, nem a operação. Uma sem a outra é a janela que não pode existir.
    expect(await getDb().scenes.count()).toBe(0);
    expect(await getDb().outbox.count()).toBe(0);
  });

  it('desfaz a alteração quando o enfileiramento falha', async () => {
    const sceneId = await createScene({ productionId: PRODUCAO, number: '12' });
    await getDb().outbox.clear();

    dublê.mockRejectedValueOnce(new Error('IndexedDB cheio'));
    await expect(
      patchEntity('scene', sceneId, { location: 'Praia de Copacabana' }),
    ).rejects.toThrow();

    expect((await getDb().scenes.get(sceneId))?.location).toBeUndefined();
    expect(await getDb().outbox.count()).toBe(0);
  });

  it('com o enfileiramento inteiro, as duas escritas ficam', async () => {
    const sceneId = await createScene({ productionId: PRODUCAO, number: '12' });

    expect(await getDb().scenes.get(sceneId)).toBeDefined();
    expect(await getDb().outbox.count()).toBe(1);
  });
});
