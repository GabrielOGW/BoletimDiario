/**
 * Os três departamentos sobre o IndexedDB real (ADR-041, ADR-042).
 *
 * O que só dá para provar aqui, e não nas suítes `.mjs`:
 *
 * - a foto nasce **inteira ou não nasce**: registro, bytes e fila na mesma transação;
 * - os bytes sobem **depois** do registro, e nunca de novo depois de aceitos;
 * - quem não tem os bytes os pede, e só as fotos das diárias fixadas descem sozinhas;
 * - nota de raccord não converge com outra (id aleatório), e roll apagado é restaurado,
 *   não recriado — o `CREATE` repetido seria ignorado pelo servidor;
 * - a fixação aceita um servidor antigo, que não manda as listas novas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SYNC_PROTOCOL, type SnapshotResponse } from '@/lib/contracts/sync';
import { PINS_KEY, getDb, setMeta } from '@/lib/offline/db';
import {
  createNota,
  fotosPendentes,
  getFotoBlob,
  listFotos,
  listNotas,
  removeFoto,
  salvaFoto,
} from '@/lib/offline/repos/continuidade';
import { pinShootingDay } from '@/lib/offline/repos/diaria';
import {
  ensureSoundRoll,
  listSoundRolls,
  removeSoundRoll,
  soundRollId,
} from '@/lib/offline/repos/som';
import { baixaFoto, baixaFotos, enviaFotos } from '@/lib/sync/fotos';

import { limpaBanco } from './db-limpo';

const PRODUCAO = '11111111-1111-4111-8111-111111111111';
const DIARIA = '22222222-2222-4222-8222-222222222222';
const CENA = '55555555-5555-4555-8555-555555555555';

const bytes = (n: number) => new Uint8Array(n).fill(7).buffer;

let chamadas: { url: string; method: string; tamanho: number }[];
let respostaDoEnvio: number;
let respostaDoDownload: number;

beforeEach(async () => {
  await limpaBanco();
  chamadas = [];
  respostaDoEnvio = 200;
  respostaDoDownload = 200;

  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const corpo = init?.body as ArrayBuffer | undefined;
    chamadas.push({ url: String(url), method, tamanho: corpo?.byteLength ?? 0 });
    const status = method === 'POST' ? respostaDoEnvio : respostaDoDownload;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      arrayBuffer: async () => bytes(42),
      json: async () => ({ protocol: SYNC_PROTOCOL }),
    } as unknown as Response;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function fotoNaCena(): Promise<string> {
  return salvaFoto({
    productionId: PRODUCAO,
    sceneId: CENA,
    category: 'OBJETOS',
    mimeType: 'image/jpeg',
    bytes: bytes(1000),
    width: 1600,
    height: 1200,
  });
}

/** O push confirmou o registro: é o que o motor faz quando o servidor aplica. */
async function registroConfirmado(id: string): Promise<void> {
  await getDb().continuityPhotos.update(id, { _dirty: 0, version: 1 });
  await getDb().outbox.clear();
}

describe('foto: registro, bytes e fila', () => {
  it('nasce com os três de uma vez', async () => {
    const id = await fotoNaCena();

    const registro = await getDb().continuityPhotos.get(id);
    expect(registro).toMatchObject({ sceneId: CENA, category: 'OBJETOS', sizeBytes: 1000 });

    const blob = await getFotoBlob(id);
    expect(blob?.uploaded).toBe(0);
    expect(blob?.bytes.byteLength).toBe(1000);

    const fila = await getDb().outbox.toArray();
    expect(fila).toHaveLength(1);
    expect(fila[0]).toMatchObject({ entityType: 'continuityPhoto', operation: 'CREATE' });
    // Os bytes **não** vão na fila de texto — só o registro.
    expect(JSON.stringify(fila[0].fields)).not.toContain('bytes');

    expect(await fotosPendentes(PRODUCAO)).toBe(1);
  });

  it('se a fila falhar, nem o registro nem os bytes ficam', async () => {
    const db = getDb();
    const original = db.outbox.add.bind(db.outbox);
    const espiao = vi
      .spyOn(db.outbox, 'add')
      .mockRejectedValueOnce(new Error('IndexedDB cheio'));

    await expect(fotoNaCena()).rejects.toThrow();
    expect(await db.continuityPhotos.count()).toBe(0);
    expect(await db.photoBlobs.count()).toBe(0);

    espiao.mockImplementation(original);
  });

  it('lista só o que não foi apagado, pelo escopo', async () => {
    const id = await fotoNaCena();
    expect(await listFotos({ sceneIds: [CENA] })).toHaveLength(1);
    await removeFoto(id);
    expect(await listFotos({ sceneIds: [CENA] })).toHaveLength(0);
    // Ainda não subiu: os bytes ficam, para o caso de a foto ser restaurada.
    expect(await getFotoBlob(id)).toBeDefined();
  });
});

describe('envio dos bytes', () => {
  it('espera o registro subir antes de mandar os bytes', async () => {
    await fotoNaCena();
    await enviaFotos(PRODUCAO);
    expect(chamadas).toHaveLength(0);
  });

  it('manda uma vez e marca como enviada', async () => {
    const id = await fotoNaCena();
    await registroConfirmado(id);

    await enviaFotos(PRODUCAO);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toMatchObject({ method: 'POST', tamanho: 1000 });
    expect(chamadas[0].url).toContain(`photoId=${id}`);
    expect(chamadas[0].url).toContain(`protocol=${SYNC_PROTOCOL}`);
    expect((await getFotoBlob(id))?.uploaded).toBe(1);

    await enviaFotos(PRODUCAO);
    expect(chamadas).toHaveLength(1);
  });

  it('409 não perde nada: os bytes continuam esperando', async () => {
    const id = await fotoNaCena();
    await registroConfirmado(id);
    respostaDoEnvio = 409;

    await enviaFotos(PRODUCAO);
    const blob = await getFotoBlob(id);
    expect(blob?.uploaded).toBe(0);
    expect(blob?.bytes.byteLength).toBe(1000);
  });

  it('426 avisa o motor para travar', async () => {
    const id = await fotoNaCena();
    await registroConfirmado(id);
    respostaDoEnvio = 426;
    expect(await enviaFotos(PRODUCAO)).toBe(false);
  });

  it('sem rede, nada muda', async () => {
    const id = await fotoNaCena();
    await registroConfirmado(id);
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await enviaFotos(PRODUCAO)).toBe(true);
    expect((await getFotoBlob(id))?.uploaded).toBe(0);
  });
});

describe('download dos bytes', () => {
  async function fotoDeOutroAparelho(id: string, extra: Record<string, unknown>) {
    await getDb().continuityPhotos.put({
      id,
      productionId: PRODUCAO,
      category: 'FIGURINO',
      version: 1,
      _dirty: 0,
      ...extra,
    });
  }

  it('baixa sob demanda e guarda como já enviada', async () => {
    const id = '66666666-6666-4666-8666-666666666666';
    await fotoDeOutroAparelho(id, { sceneId: CENA });

    expect(await baixaFoto(PRODUCAO, id)).toBe(true);
    const blob = await getFotoBlob(id);
    expect(blob?.uploaded).toBe(1);
    expect(blob?.bytes.byteLength).toBe(42);
    // Já está aqui: não pede de novo.
    await baixaFoto(PRODUCAO, id);
    expect(chamadas.filter((c) => c.method === 'GET')).toHaveLength(1);
  });

  it('automático, só as fotos das diárias fixadas', async () => {
    const SETUP = '77777777-7777-4777-8777-777777777777';
    await getDb().setups.put({
      id: SETUP,
      productionId: PRODUCAO,
      sceneId: CENA,
      shootingDayId: DIARIA,
      code: '1',
      sortOrder: 0,
      version: 1,
      _dirty: 0,
    });
    await setMeta(PINS_KEY, [DIARIA]);

    const daDiaria = '88888888-8888-4888-8888-888888888888';
    const deOutraCena = '99999999-9999-4999-8999-999999999999';
    await fotoDeOutroAparelho(daDiaria, { sceneId: CENA });
    await fotoDeOutroAparelho(deOutraCena, { sceneId: 'outra-cena' });

    await baixaFotos(PRODUCAO);
    const pedidas = chamadas.map((c) => c.url);
    expect(pedidas.some((url) => url.includes(daDiaria))).toBe(true);
    expect(pedidas.some((url) => url.includes(deOutraCena))).toBe(false);
  });

  it('404 não grava nada, e não insiste no mesmo ciclo', async () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await fotoDeOutroAparelho(id, { sceneId: CENA });
    respostaDoDownload = 404;

    expect(await baixaFoto(PRODUCAO, id)).toBe(false);
    expect(await getFotoBlob(id)).toBeUndefined();
    expect(await baixaFoto(PRODUCAO, id)).toBe(false);
    expect(chamadas).toHaveLength(1);
  });
});

describe('notas de raccord', () => {
  it('duas notas iguais são duas observações, não a mesma', async () => {
    const a = await createNota({
      productionId: PRODUCAO,
      sceneId: CENA,
      category: 'OLHAR',
      note: 'Olha para a janela',
    });
    const b = await createNota({
      productionId: PRODUCAO,
      sceneId: CENA,
      category: 'OLHAR',
      note: 'Olha para a janela',
    });
    expect(a).not.toBe(b);
    expect(await listNotas({ sceneIds: [CENA] })).toHaveLength(2);
    expect(await getDb().outbox.count()).toBe(2);
  });
});

describe('rolos de som', () => {
  it('o mesmo rótulo na mesma diária é o mesmo roll', async () => {
    const a = await ensureSoundRoll({ productionId: PRODUCAO, shootingDayId: DIARIA, label: '004' });
    const b = await ensureSoundRoll({ productionId: PRODUCAO, shootingDayId: DIARIA, label: ' 004 ' });
    expect(a).toBe(b);
    expect(a).toBe(soundRollId(DIARIA, '004'));
    expect(await listSoundRolls(DIARIA)).toHaveLength(1);
  });

  it('roll apagado e cadastrado de novo é restaurado, não recriado', async () => {
    const id = await ensureSoundRoll({ productionId: PRODUCAO, shootingDayId: DIARIA, label: '005' });
    await removeSoundRoll(id);
    expect(await listSoundRolls(DIARIA)).toHaveLength(0);

    await getDb().outbox.clear();
    await ensureSoundRoll({ productionId: PRODUCAO, shootingDayId: DIARIA, label: '005' });

    expect(await listSoundRolls(DIARIA)).toHaveLength(1);
    const fila = await getDb().outbox.toArray();
    // Um UPDATE de `deletedAt`, que o servidor aplica — e não um CREATE que ele ignoraria.
    expect(fila).toHaveLength(1);
    expect(fila[0]).toMatchObject({ operation: 'UPDATE' });
    expect(fila[0].fields.deletedAt?.para).toBeNull();
  });
});

describe('fixação', () => {
  const snapshot = (extra: Partial<SnapshotResponse> = {}): SnapshotResponse => ({
    protocol: SYNC_PROTOCOL,
    productionId: PRODUCAO,
    cursor: 10,
    shootingDay: { id: DIARIA, date: '2026-11-12', version: 1 },
    scenes: [],
    setups: [],
    takes: [],
    cameraUnits: [],
    cameraTakeData: [],
    soundDayConfig: [],
    soundTakeData: [],
    soundTakeTracks: [],
    continuityTakeData: [],
    continuityProps: [],
    continuityWardrobe: [],
    continuityHairMakeup: [],
    continuitySetDressing: [],
    dailyProgressReport: [],
    members: [],
    ...extra,
  });

  it('aplica rolos, notas e registros de foto do servidor', async () => {
    await pinShootingDay(
      snapshot({
        soundRolls: [{ id: 'r1', shootingDayId: DIARIA, label: '004', version: '2' }],
        continuityNotes: [{ id: 'n1', sceneId: CENA, note: 'Olhar', version: '1' }],
        continuityPhotos: [
          { id: 'f1', sceneId: CENA, width: '1600', sizeBytes: '1000', version: '1' },
        ],
      }),
    );

    expect(await listSoundRolls(DIARIA)).toHaveLength(1);
    expect(await listNotas({ sceneIds: [CENA] })).toHaveLength(1);
    const foto = await getDb().continuityPhotos.get('f1');
    // O fio traz texto; o registro local volta a ter número.
    expect(foto?.width).toBe(1600);
    expect(foto?.sizeBytes).toBe(1000);
  });

  it('aceita um servidor antigo, sem as listas novas', async () => {
    await expect(pinShootingDay(snapshot())).resolves.toBeUndefined();
    expect(await getDb().shootingDays.get(DIARIA)).toBeDefined();
  });
});
