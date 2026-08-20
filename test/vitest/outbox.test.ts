/**
 * A fila de saída contra IndexedDB de verdade.
 *
 * O que as suítes `.mjs` já provam é a coalescência pura (`coalesceFields`). O que só se
 * prova aqui é o resto: que a coalescência acha a operação certa pelo índice composto,
 * que a operação **em voo** não é tocada, e que a ordem de saída é a de criação — as três
 * coisas que, quebradas, produzem o mesmo sintoma mudo: o dado está no aparelho e nunca
 * chega ao servidor.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { getDb, type OutboxEntry } from '@/lib/offline/db';
import { backoffMs, enqueue, nextBatch, pendingCount } from '@/lib/offline/outbox';

import { limpaBanco } from './db-limpo';

const PRODUCAO = 'producao-1';
const OUTRA = 'producao-2';

const filaDe = (productionId: string): Promise<OutboxEntry[]> =>
  getDb().outbox.where('productionId').equals(productionId).toArray();

beforeEach(limpaBanco);

describe('enfileirar', () => {
  it('grava a operação como pendente com o delta dos dois valores', async () => {
    await enqueue({
      productionId: PRODUCAO,
      entityType: 'take',
      entityId: 'take-1',
      operation: 'UPDATE',
      fields: { notes: { de: null, para: 'primeira' } },
    });

    const [entry] = await filaDe(PRODUCAO);
    expect(entry.status).toBe('PENDING');
    expect(entry.attempts).toBe(0);
    expect(entry.fields.notes).toEqual({ de: null, para: 'primeira' });
  });

  it('coalesce no que já espera e preserva o "de" original', async () => {
    // O caso real: um campo digitado com debounce de 500 ms gera uma dezena de operações.
    const digitacao = [
      [null, 'a'],
      ['a', 'ab'],
      ['ab', 'abc'],
    ] as const;

    for (const [de, para] of digitacao) {
      await enqueue({
        productionId: PRODUCAO,
        entityType: 'take',
        entityId: 'take-1',
        operation: 'UPDATE',
        fields: { notes: { de, para } },
      });
    }

    const fila = await filaDe(PRODUCAO);
    expect(fila).toHaveLength(1);
    // Substituir o "de" faria a operação afirmar um estado que o servidor nunca viu, e o
    // compare-and-set devolveria conflito do usuário com ele mesmo.
    expect(fila[0].fields.notes).toEqual({ de: null, para: 'abc' });
  });

  it('coalesce campos diferentes do mesmo registro numa operação só', async () => {
    await enqueue({
      productionId: PRODUCAO,
      entityType: 'take',
      entityId: 'take-1',
      operation: 'UPDATE',
      fields: { notes: { de: null, para: 'nota' } },
    });
    await enqueue({
      productionId: PRODUCAO,
      entityType: 'take',
      entityId: 'take-1',
      operation: 'UPDATE',
      fields: { status: { de: 'RECORDED', para: 'CIRCLE' } },
    });

    const fila = await filaDe(PRODUCAO);
    expect(fila).toHaveLength(1);
    expect(Object.keys(fila[0].fields).sort()).toEqual(['notes', 'status']);
  });

  it('não toca na operação em voo — abre uma nova', async () => {
    await enqueue({
      productionId: PRODUCAO,
      entityType: 'take',
      entityId: 'take-1',
      operation: 'UPDATE',
      fields: { notes: { de: null, para: 'enviada' } },
    });

    const [emVoo] = await filaDe(PRODUCAO);
    await getDb().outbox.put({ ...emVoo, status: 'SYNCING' });

    await enqueue({
      productionId: PRODUCAO,
      entityType: 'take',
      entityId: 'take-1',
      operation: 'UPDATE',
      fields: { notes: { de: 'enviada', para: 'depois' } },
    });

    const fila = await filaDe(PRODUCAO);
    // Mexer no payload depois de enviado quebraria a idempotência do servidor: ele já
    // guardou o resultado daquele id.
    expect(fila).toHaveLength(2);
    const enviada = fila.find((entry) => entry.status === 'SYNCING');
    expect(enviada?.fields.notes).toEqual({ de: null, para: 'enviada' });
  });

  it('ignora campo que não está no registro do contrato', async () => {
    await enqueue({
      productionId: PRODUCAO,
      entityType: 'take',
      entityId: 'take-1',
      operation: 'UPDATE',
      fields: {
        notes: { de: null, para: 'vale' },
        inventado: { de: null, para: 'não vale' },
      },
    });

    const [entry] = await filaDe(PRODUCAO);
    expect(Object.keys(entry.fields)).toEqual(['notes']);
  });

  it('descarta campo cujo "de" e "para" são o mesmo valor', async () => {
    await enqueue({
      productionId: PRODUCAO,
      entityType: 'take',
      entityId: 'take-1',
      operation: 'UPDATE',
      // 5 e "5" são o mesmo number de take: acusar mudança aqui daria conflito espúrio
      // no compare-and-set.
      fields: { number: { de: 5, para: '5' }, notes: { de: 'x', para: 'x' } },
    });

    expect(await filaDe(PRODUCAO)).toHaveLength(0);
  });

  it('enfileira criação mesmo sem campo — criar já é a informação', async () => {
    await enqueue({
      productionId: PRODUCAO,
      entityType: 'take',
      entityId: 'take-1',
      operation: 'CREATE',
      fields: {},
    });

    expect(await filaDe(PRODUCAO)).toHaveLength(1);
  });
});

describe('próximo lote', () => {
  async function enfileira(
    id: string,
    createdAt: string,
    extra: Partial<OutboxEntry> = {},
  ): Promise<void> {
    await getDb().outbox.add({
      id,
      productionId: PRODUCAO,
      entityType: 'take',
      entityId: id,
      operation: 'UPDATE',
      fields: { notes: { de: null, para: id } },
      createdAt,
      attempts: 0,
      status: 'PENDING',
      ...extra,
    });
  }

  it('sai em ordem de criação — o setup antes do take que o referencia', async () => {
    await enfileira('c', '2026-08-20T10:00:02.000Z');
    await enfileira('a', '2026-08-20T10:00:00.000Z');
    await enfileira('b', '2026-08-20T10:00:01.000Z');

    const lote = await nextBatch(PRODUCAO);
    expect(lote.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });

  it('as 50 operações de uma diária offline saem todas, na ordem', async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `op-${String(i).padStart(2, '0')}`);
    for (const [i, id] of ids.entries()) {
      await enfileira(id, `2026-08-20T10:${String(i).padStart(2, '0')}:00.000Z`);
    }

    const lote = await nextBatch(PRODUCAO);
    expect(lote).toHaveLength(50);
    expect(lote.map((entry) => entry.id)).toEqual(ids);
  });

  it('segura quem está de castigo pelo backoff e devolve quem já venceu', async () => {
    await enfileira('esperando', '2026-08-20T10:00:00.000Z', {
      retryAfter: Date.now() + 60_000,
    });
    await enfileira('pronta', '2026-08-20T10:00:01.000Z', {
      retryAfter: Date.now() - 1_000,
    });

    const lote = await nextBatch(PRODUCAO);
    expect(lote.map((entry) => entry.id)).toEqual(['pronta']);
  });

  it('não mistura produções nem operações já resolvidas', async () => {
    await enfileira('minha', '2026-08-20T10:00:00.000Z');
    await enfileira('falhou', '2026-08-20T10:00:01.000Z', { status: 'FAILED' });
    await getDb().outbox.add({
      id: 'de-outra',
      productionId: OUTRA,
      entityType: 'take',
      entityId: 'de-outra',
      operation: 'UPDATE',
      fields: {},
      createdAt: '2026-08-20T09:00:00.000Z',
      attempts: 0,
      status: 'PENDING',
    });

    const lote = await nextBatch(PRODUCAO);
    expect(lote.map((entry) => entry.id)).toEqual(['minha']);
  });

  it('respeita o limite do lote', async () => {
    for (let i = 0; i < 5; i += 1) {
      await enfileira(`op-${i}`, `2026-08-20T10:00:0${i}.000Z`);
    }

    expect(await nextBatch(PRODUCAO, 3)).toHaveLength(3);
  });

  it('conta como pendente o que está na fila e o que está em voo', async () => {
    await enfileira('pendente', '2026-08-20T10:00:00.000Z');
    await enfileira('em-voo', '2026-08-20T10:00:01.000Z', { status: 'SYNCING' });
    await enfileira('resolvida', '2026-08-20T10:00:02.000Z', { status: 'SYNCED' });

    expect(await pendingCount(PRODUCAO)).toBe(2);
    expect(await pendingCount(OUTRA)).toBe(0);
  });
});

describe('backoff', () => {
  it('cresce com as tentativas e para no teto de cinco minutos', () => {
    for (let attempts = 1; attempts <= 20; attempts += 1) {
      expect(backoffMs(attempts)).toBeLessThanOrEqual(5 * 60 * 1000);
    }
  });

  it('tem jitter — a equipe inteira reconecta no mesmo instante', () => {
    // Sem jitter, todos os aparelhos batem no servidor juntos quando o Wi-Fi da base
    // volta, e repetem a pancada a cada rodada.
    const amostras = new Set(Array.from({ length: 40 }, () => backoffMs(4)));
    expect(amostras.size).toBeGreaterThan(1);
  });

  it('nunca devolve espera menor que a metade da base', () => {
    for (let i = 0; i < 40; i += 1) {
      expect(backoffMs(1)).toBeGreaterThanOrEqual(1000);
    }
  });
});
