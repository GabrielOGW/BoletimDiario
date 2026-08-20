/**
 * O motor de sync visto do lado do aparelho.
 *
 * `npm run test:sync` prova o que o **servidor** decide — compare-and-set, idempotência,
 * cursor — contra o Neon real. O que nunca teve teste é este lado: o que o cliente faz
 * com a resposta. E é aqui que os erros são mudos, porque quase todos terminam do mesmo
 * jeito — a fila esvazia sem o dado ter chegado, ou o dado chega e some da tela.
 *
 * O `fetch` é substituído por um roteador de mentira. O IndexedDB é de verdade: as
 * transações do push e do pull são metade do que se quer provar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SYNC_PROTOCOL,
  type PullResponse,
  type PushResponse,
} from '@/lib/contracts/sync';
import { cursorKey, getDb, getMeta, setMeta, type OutboxEntry } from '@/lib/offline/db';
import { getSyncSnapshot, pull, push, resolveConflict } from '@/lib/sync/engine';

import { limpaBanco } from './db-limpo';

const PRODUCAO = '11111111-1111-4111-8111-111111111111';
const TAKE = '33333333-3333-4333-8333-333333333333';

// ---- fetch de mentira ----

type Resposta = { status?: number; body?: unknown; erro?: boolean };

let respostas: { push: Resposta[]; pull: Resposta[] };
let chamadas: { url: string; body: unknown }[];

function responde(fila: Resposta[]): Response {
  const proxima = fila.length > 1 ? fila.shift()! : (fila[0] ?? {});
  if (proxima.erro) throw new TypeError('Failed to fetch');
  const status = proxima.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => proxima.body,
  } as Response;
}

beforeEach(async () => {
  await limpaBanco();
  respostas = { push: [], pull: [] };
  chamadas = [];

  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    chamadas.push({ url: String(url), body });
    return responde(String(url).includes('/push') ? respostas.push : respostas.pull);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---- montagem ----

async function takeLocal(overrides: Record<string, unknown> = {}): Promise<void> {
  await getDb().takes.put({
    id: TAKE,
    productionId: PRODUCAO,
    setupId: 'setup-1',
    number: 1,
    status: 'RECORDED',
    notes: 'minha nota',
    version: 4,
    _dirty: 1,
    ...overrides,
  });
}

async function naFila(overrides: Partial<OutboxEntry> = {}): Promise<OutboxEntry> {
  const entry: OutboxEntry = {
    id: '44444444-4444-4444-8444-444444444444',
    productionId: PRODUCAO,
    entityType: 'take',
    entityId: TAKE,
    operation: 'UPDATE',
    fields: { notes: { de: null, para: 'minha nota' } },
    createdAt: '2026-08-20T10:00:00.000Z',
    attempts: 0,
    status: 'PENDING',
    ...overrides,
  };
  await getDb().outbox.put(entry);
  return entry;
}

const aplicado = (id: string, campos: string[]): PushResponse => ({
  protocol: SYNC_PROTOCOL,
  results: [{ id, status: 'APPLIED', applied: campos, conflicts: [] }],
});

/** Zera o contador de falhas seguidas, que é estado de módulo. */
async function comSinal(): Promise<void> {
  respostas.pull = [
    { body: { protocol: SYNC_PROTOCOL, changes: [], cursor: 0, hasMore: false } },
  ];
  await pull(PRODUCAO);
}

describe('push', () => {
  it('não fala com o servidor quando a fila está vazia', async () => {
    await push(PRODUCAO);
    expect(chamadas).toHaveLength(0);
  });

  it('manda o protocolo e o delta, e limpa a fila quando aplica', async () => {
    await takeLocal();
    const entry = await naFila();
    respostas.push = [{ body: aplicado(entry.id, ['notes']) }];

    await push(PRODUCAO);

    const enviado = chamadas[0].body as { protocol: number; operations: unknown[] };
    expect(enviado.protocol).toBe(SYNC_PROTOCOL);
    expect(enviado.operations).toHaveLength(1);
    expect(await getDb().outbox.count()).toBe(0);
    // `_dirty` só cai quando a entidade não tem mais nada na fila.
    expect((await getDb().takes.get(TAKE))?._dirty).toBe(0);
  });

  it('mantém o registro sujo enquanto sobrar operação daquela entidade', async () => {
    await takeLocal();
    const entry = await naFila();
    await naFila({ id: '55555555-5555-4555-8555-555555555555', status: 'SYNCING' });
    respostas.push = [{ body: aplicado(entry.id, ['notes']) }];

    await push(PRODUCAO);

    expect((await getDb().takes.get(TAKE))?._dirty).toBe(1);
  });

  it('converge para o servidor e guarda o meu valor como pendência', async () => {
    await takeLocal();
    const entry = await naFila();
    respostas.push = [
      {
        body: {
          protocol: SYNC_PROTOCOL,
          results: [
            {
              id: entry.id,
              status: 'CONFLICT',
              applied: [],
              conflicts: [
                {
                  field: 'notes',
                  atual: 'nota da Alice',
                  atualPor: 'membro-1',
                  atualEm: '2026-08-20T11:00:00.000Z',
                },
              ],
            },
          ],
        } satisfies PushResponse,
      },
    ];

    await push(PRODUCAO);

    // Não é "quem escreveu por último ganha": em set o último a sincronizar costuma ser
    // quem estava com o pior sinal, não quem tem a informação certa.
    expect((await getDb().takes.get(TAKE))?.notes).toBe('nota da Alice');

    const [conflito] = await getDb().syncConflicts.toArray();
    expect(conflito.field).toBe('notes');
    expect(conflito.meuValor).toBe('minha nota');
    expect(conflito.valorRemoto).toBe('nota da Alice');
    expect(conflito.status).toBe('PENDING');
    expect(getSyncSnapshot().conflicts).toBe(1);
  });

  it('conflito num campo não impede os outros do mesmo push', async () => {
    await takeLocal();
    const comConflito = await naFila({
      fields: { notes: { de: null, para: 'minha nota' } },
    });
    const limpo = await naFila({
      id: '66666666-6666-4666-8666-666666666666',
      entityId: 'outro-take',
      createdAt: '2026-08-20T10:00:01.000Z',
      fields: { status: { de: 'RECORDED', para: 'CIRCLE' } },
    });
    respostas.push = [
      {
        body: {
          protocol: SYNC_PROTOCOL,
          results: [
            {
              id: comConflito.id,
              status: 'CONFLICT',
              applied: [],
              conflicts: [
                { field: 'notes', atual: 'outra', atualPor: null, atualEm: null },
              ],
            },
            { id: limpo.id, status: 'APPLIED', applied: ['status'], conflicts: [] },
          ],
        } satisfies PushResponse,
      },
    ];

    await push(PRODUCAO);

    // As duas saem da fila: o conflito vira decisão de um toque, não bloqueio.
    expect(await getDb().outbox.count()).toBe(0);
    expect(await getDb().syncConflicts.count()).toBe(1);
  });

  it('protocolo recusado trava o sync sem gastar tentativa', async () => {
    await naFila();
    respostas.push = [{ status: 426 }];

    await push(PRODUCAO);

    const [entry] = await getDb().outbox.toArray();
    expect(entry.status).toBe('PENDING');
    // Gastar tentativa aqui empurraria o backoff para minutos por um erro que não passa
    // com o tempo — passa com uma atualização.
    expect(entry.attempts).toBe(0);
    expect(entry.retryAfter).toBeUndefined();
    expect(getSyncSnapshot().sync).toBe('OUTDATED');
  });

  it('sessão expirada marca a operação como falha e preserva o payload', async () => {
    await naFila();
    respostas.push = [{ status: 401 }];

    await push(PRODUCAO);

    const [entry] = await getDb().outbox.toArray();
    expect(entry.status).toBe('FAILED');
    expect(entry.error).toContain('Sessão expirada');
    // O payload continua na fila, visível e exportável: descartá-lo é perder o dia.
    expect(entry.fields.notes).toEqual({ de: null, para: 'minha nota' });
    expect(getSyncSnapshot().sync).toBe('ERROR');
  });

  it('perda de permissão vira falha com o motivo certo', async () => {
    await naFila();
    respostas.push = [{ status: 403 }];

    await push(PRODUCAO);

    const [entry] = await getDb().outbox.toArray();
    expect(entry.status).toBe('FAILED');
    expect(entry.error).toContain('Sem permissão');
  });

  it('falha de rede devolve para a fila com backoff', async () => {
    await naFila();
    respostas.push = [{ erro: true }];

    await push(PRODUCAO);

    const [entry] = await getDb().outbox.toArray();
    expect(entry.status).toBe('PENDING');
    expect(entry.attempts).toBe(1);
    expect(entry.retryAfter).toBeGreaterThan(Date.now());
  });

  it('erro do servidor também devolve para a fila', async () => {
    await naFila({ attempts: 2 });
    respostas.push = [{ status: 500 }];

    await push(PRODUCAO);

    const [entry] = await getDb().outbox.toArray();
    expect(entry.status).toBe('PENDING');
    expect(entry.attempts).toBe(3);
  });

  it('resultado FAILED do servidor guarda o motivo sem descartar a operação', async () => {
    const entry = await naFila();
    respostas.push = [
      {
        body: {
          protocol: SYNC_PROTOCOL,
          results: [
            {
              id: entry.id,
              status: 'FAILED',
              applied: [],
              conflicts: [],
              reason: 'setup inexistente',
            },
          ],
        } satisfies PushResponse,
      },
    ];

    await push(PRODUCAO);

    const [depois] = await getDb().outbox.toArray();
    expect(depois.status).toBe('FAILED');
    expect(depois.error).toBe('setup inexistente');
  });

  it('só declara o servidor inalcançável depois de duas falhas seguidas', async () => {
    // `navigator.onLine` é gatilho, nunca verdade: captive portal de locação reporta
    // "online" sem internet. E uma falha isolada é comum demais para virar aviso.
    await comSinal();
    expect(getSyncSnapshot().server).toBe('REACHABLE');

    await naFila();
    respostas.push = [{ erro: true }];
    await push(PRODUCAO);
    expect(getSyncSnapshot().server).toBe('REACHABLE');

    await getDb().outbox.toCollection().modify({ retryAfter: undefined });
    await push(PRODUCAO);
    expect(getSyncSnapshot().server).toBe('UNREACHABLE');
  });
});

describe('pull', () => {
  const mudanca = (overrides: Record<string, unknown> = {}) => ({
    entityType: 'take' as const,
    entityId: TAKE,
    operation: 'UPDATE' as const,
    version: 9,
    seq: 100,
    data: {
      id: TAKE,
      setupId: 'setup-1',
      number: '7',
      status: 'CIRCLE',
      notes: 'do servidor',
    },
    ...overrides,
  });

  it('aplica a mudança, converte os tipos e avança o cursor', async () => {
    respostas.pull = [
      {
        body: {
          protocol: SYNC_PROTOCOL,
          changes: [mudanca()],
          cursor: 100,
          hasMore: false,
        } satisfies PullResponse,
      },
    ];

    await pull(PRODUCAO);

    const take = await getDb().takes.get(TAKE);
    expect(take?.notes).toBe('do servidor');
    // `rowFromWire` devolve os tipos do registro: "7" volta a ser 7, e a tela não precisa
    // lembrar de um `Number(...)`.
    expect(take?.number).toBe(7);
    expect(take?.version).toBe(9);
    expect(take?._dirty).toBe(0);
    expect(await getMeta(cursorKey(PRODUCAO), 0)).toBe(100);
  });

  it('manda o cursor guardado na consulta seguinte', async () => {
    await setMeta(cursorKey(PRODUCAO), 55);
    respostas.pull = [
      { body: { protocol: SYNC_PROTOCOL, changes: [], cursor: 55, hasMore: false } },
    ];

    await pull(PRODUCAO);

    expect(chamadas[0].url).toContain('since=55');
  });

  it('não sobrescreve campo que ainda está na fila', async () => {
    await takeLocal({ notes: 'o que eu digitei', _dirty: 1 });
    await naFila({ fields: { notes: { de: null, para: 'o que eu digitei' } } });
    respostas.pull = [
      {
        body: {
          protocol: SYNC_PROTOCOL,
          changes: [mudanca()],
          cursor: 100,
          hasMore: false,
        } satisfies PullResponse,
      },
    ];

    await pull(PRODUCAO);

    const take = await getDb().takes.get(TAKE);
    // O que o usuário digitou e ainda não saiu do aparelho é mais recente que o servidor.
    expect(take?.notes).toBe('o que eu digitei');
    expect(take?.status).toBe('CIRCLE');
    expect(take?._dirty).toBe(1);
  });

  it('ignora o eco do próprio push', async () => {
    await takeLocal({ version: 9, notes: 'local', _dirty: 0 });
    respostas.pull = [
      {
        body: {
          protocol: SYNC_PROTOCOL,
          changes: [mudanca({ version: 9 })],
          cursor: 100,
          hasMore: false,
        } satisfies PullResponse,
      },
    ];

    await pull(PRODUCAO);

    expect((await getDb().takes.get(TAKE))?.notes).toBe('local');
  });

  it('ignora tipo de entidade que este cliente não conhece, e o cursor avança igual', async () => {
    respostas.pull = [
      {
        body: {
          protocol: SYNC_PROTOCOL,
          changes: [
            { ...mudanca(), entityType: 'departamentoDoFuturo', entityId: 'x' },
            mudanca(),
          ],
          cursor: 100,
          hasMore: false,
        } as unknown as PullResponse,
      },
    ];

    // Sem essa tolerância, a primeira escrita de um departamento novo derrubaria o pull de
    // quem está na versão anterior — e o sintoma seria "parou de sincronizar".
    await pull(PRODUCAO);

    expect(await getMeta(cursorKey(PRODUCAO), 0)).toBe(100);
    expect(await getDb().takes.get(TAKE)).toBeDefined();
  });

  it('ignora mudança sem dado', async () => {
    respostas.pull = [
      {
        body: {
          protocol: SYNC_PROTOCOL,
          changes: [mudanca({ data: null })],
          cursor: 100,
          hasMore: false,
        } satisfies PullResponse,
      },
    ];

    await pull(PRODUCAO);

    expect(await getDb().takes.get(TAKE)).toBeUndefined();
    expect(await getMeta(cursorKey(PRODUCAO), 0)).toBe(100);
  });

  it('continua enquanto o servidor disser que há mais', async () => {
    respostas.pull = [
      {
        body: {
          protocol: SYNC_PROTOCOL,
          changes: [mudanca()],
          cursor: 100,
          hasMore: true,
        } satisfies PullResponse,
      },
      {
        body: {
          protocol: SYNC_PROTOCOL,
          changes: [
            mudanca({ version: 10, data: { id: TAKE, notes: 'segunda página' } }),
          ],
          cursor: 200,
          hasMore: false,
        } satisfies PullResponse,
      },
    ];

    await pull(PRODUCAO);

    expect(chamadas).toHaveLength(2);
    expect((await getDb().takes.get(TAKE))?.notes).toBe('segunda página');
    expect(await getMeta(cursorKey(PRODUCAO), 0)).toBe(200);
  });

  it('não avança o cursor quando a rede cai nem quando o protocolo é recusado', async () => {
    await setMeta(cursorKey(PRODUCAO), 12);

    respostas.pull = [{ erro: true }];
    await pull(PRODUCAO);
    expect(await getMeta(cursorKey(PRODUCAO), 0)).toBe(12);

    respostas.pull = [{ status: 426 }];
    await pull(PRODUCAO);
    expect(await getMeta(cursorKey(PRODUCAO), 0)).toBe(12);
    expect(getSyncSnapshot().sync).toBe('OUTDATED');
  });
});

describe('resolução de conflito', () => {
  async function conflitoPendente(): Promise<string> {
    const id = '77777777-7777-4777-8777-777777777777';
    await getDb().syncConflicts.put({
      id,
      productionId: PRODUCAO,
      entityType: 'take',
      entityId: TAKE,
      field: 'notes',
      meuValor: 'minha nota',
      valorRemoto: 'nota da Alice',
      remotoPor: 'membro-1',
      remotoEm: '2026-08-20T11:00:00.000Z',
      detectadoEm: '2026-08-20T11:00:01.000Z',
      status: 'PENDING',
    });
    return id;
  }

  it('escolher o meu reenfileira um compare-and-set a partir do valor remoto', async () => {
    await takeLocal({ notes: 'nota da Alice', _dirty: 0 });
    const id = await conflitoPendente();

    await resolveConflict(id, 'MEU');

    const [entry] = await getDb().outbox.toArray();
    // Sem caminho de código especial: é o mesmo compare-and-set de sempre, agora partindo
    // do valor que o servidor confirmou.
    expect(entry.fields.notes).toEqual({ de: 'nota da Alice', para: 'minha nota' });
    expect((await getDb().takes.get(TAKE))?.notes).toBe('minha nota');
    expect((await getDb().syncConflicts.get(id))?.status).toBe('RESOLVED');
  });

  it('escolher o remoto não escreve nada — o local já convergiu', async () => {
    await takeLocal({ notes: 'nota da Alice', _dirty: 0 });
    const id = await conflitoPendente();

    await resolveConflict(id, 'REMOTO');

    expect(await getDb().outbox.count()).toBe(0);
    expect((await getDb().takes.get(TAKE))?.notes).toBe('nota da Alice');
    expect((await getDb().syncConflicts.get(id))?.resolucao).toBe('REMOTO');
  });

  it('resolver duas vezes não faz nada na segunda', async () => {
    await takeLocal({ notes: 'nota da Alice', _dirty: 0 });
    const id = await conflitoPendente();

    await resolveConflict(id, 'MEU');
    await getDb().outbox.clear();
    await resolveConflict(id, 'MEU');

    expect(await getDb().outbox.count()).toBe(0);
  });

  it('conflito inexistente é ignorado', async () => {
    await resolveConflict('não-existe', 'MEU');
    expect(await getDb().outbox.count()).toBe(0);
  });
});
