/**
 * O repositório da fronteira.
 *
 * A regra que este arquivo existe para proteger é uma só: **a escrita local e o
 * enfileiramento acontecem na mesma transação Dexie**. Separadas, existe uma janela em
 * que o dado está salvo no aparelho e nunca vai sincronizar — e ninguém percebe até o fim
 * da diária, quando já não há como reconstruir o que faltou.
 *
 * O resto do arquivo cobre o que decorre disso: id derivado da chave natural (ADR-019),
 * `_dirty`, exclusão como campo, e a fixação que não sobrescreve o que está sujo.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { deriveId } from '@/domain/platform/derive-id';
import { PINS_KEY, getDb, getMeta } from '@/lib/offline/db';
import type { SnapshotResponse } from '@/lib/contracts/sync';
import {
  createScene,
  createSetup,
  createTake,
  isPinned,
  listScenes,
  listSetups,
  listTakes,
  nextTakeNumber,
  patchEntity,
  pinShootingDay,
  restore,
  softDelete,
  unpin,
} from '@/lib/offline/repos/diaria';

import { limpaBanco } from './db-limpo';

const PRODUCAO = '11111111-1111-4111-8111-111111111111';
const DIARIA = '22222222-2222-4222-8222-222222222222';

beforeEach(limpaBanco);

async function cenaComSetup(): Promise<{ sceneId: string; setupId: string }> {
  const sceneId = await createScene({ productionId: PRODUCAO, number: '12', block: 'A' });
  const setupId = await createSetup({
    productionId: PRODUCAO,
    sceneId,
    shootingDayId: DIARIA,
    code: 'C',
  });
  return { sceneId, setupId };
}

describe('criar', () => {
  it('grava o registro e a intenção de sincronizar juntos', async () => {
    const sceneId = await createScene({ productionId: PRODUCAO, number: '12' });

    const cena = await getDb().scenes.get(sceneId);
    expect(cena?.number).toBe('12');
    expect(cena?.version).toBe(0);
    expect(cena?._dirty).toBe(1);

    const fila = await getDb().outbox.toArray();
    expect(fila).toHaveLength(1);
    expect(fila[0].operation).toBe('CREATE');
    expect(fila[0].entityType).toBe('scene');
    expect(fila[0].entityId).toBe(sceneId);
  });

  it('deriva o id da chave natural — dois aparelhos criam o take 4 do mesmo setup', async () => {
    const { setupId } = await cenaComSetup();

    const primeiro = await createTake({ productionId: PRODUCAO, setupId, number: 4 });
    const segundo = await createTake({ productionId: PRODUCAO, setupId, number: 4 });

    expect(primeiro).toBe(deriveId('take', setupId, '4'));
    expect(segundo).toBe(primeiro);
    // A colisão vira convergência: um take só, e uma operação só na fila.
    expect(await getDb().takes.count()).toBe(1);
    expect(await getDb().outbox.where('entityType').equals('take').count()).toBe(1);
  });

  it('não enfileira campo vazio na criação', async () => {
    const sceneId = await createScene({ productionId: PRODUCAO, number: '12' });
    const [entry] = await getDb()
      .outbox.where('[entityType+entityId]')
      .equals(['scene', sceneId])
      .toArray();

    expect(Object.keys(entry.fields)).toContain('number');
    expect(Object.keys(entry.fields)).not.toContain('block');
  });

  it('numera o próximo take por setup, não por cena', async () => {
    const { sceneId, setupId } = await cenaComSetup();
    const outro = await createSetup({
      productionId: PRODUCAO,
      sceneId,
      shootingDayId: DIARIA,
      code: 'D',
    });

    await createTake({ productionId: PRODUCAO, setupId, number: 1 });
    await createTake({ productionId: PRODUCAO, setupId, number: 2 });

    expect(await nextTakeNumber(setupId)).toBe(3);
    expect(await nextTakeNumber(outro)).toBe(1);
  });
});

describe('alterar', () => {
  it('escreve local e enfileira o delta com os dois valores', async () => {
    const { setupId } = await cenaComSetup();
    const takeId = await createTake({ productionId: PRODUCAO, setupId, number: 1 });
    await getDb().outbox.clear();
    await getDb().takes.update(takeId, { _dirty: 0, version: 3 });

    await patchEntity('take', takeId, { notes: 'boa' });

    const take = await getDb().takes.get(takeId);
    expect(take?.notes).toBe('boa');
    expect(take?._dirty).toBe(1);

    const [entry] = await getDb().outbox.toArray();
    // O "de" é o que está gravado agora: é exatamente o que o servidor precisa para
    // decidir campo a campo sem manter histórico.
    expect(entry.fields.notes).toEqual({ de: null, para: 'boa' });
    expect(entry.operation).toBe('UPDATE');
  });

  it('não faz nada quando o valor não mudou', async () => {
    const { setupId } = await cenaComSetup();
    const takeId = await createTake({ productionId: PRODUCAO, setupId, number: 1 });
    await patchEntity('take', takeId, { notes: 'boa' });
    await getDb().outbox.clear();

    await patchEntity('take', takeId, { notes: 'boa' });

    expect(await getDb().outbox.count()).toBe(0);
  });

  it('ignora registro que não existe localmente', async () => {
    await patchEntity('take', 'take-fantasma', { notes: 'boa' });

    expect(await getDb().outbox.count()).toBe(0);
    expect(await getDb().takes.count()).toBe(0);
  });

  it('exclusão é um campo e passa pelo mesmo caminho', async () => {
    const { setupId } = await cenaComSetup();
    const takeId = await createTake({ productionId: PRODUCAO, setupId, number: 1 });
    await getDb().outbox.clear();

    await softDelete('take', takeId);

    const [entry] = await getDb().outbox.toArray();
    expect(entry.operation).toBe('UPDATE');
    expect(Object.keys(entry.fields)).toEqual(['deletedAt']);
    // É o que resolve edição × exclusão sem mecanismo novo: quem editou depois vê "o
    // outro apagou" como conflito de campo, com a opção de restaurar.
    expect(entry.fields.deletedAt.de).toBeNull();

    await getDb().outbox.clear();
    await restore('take', takeId);
    const [volta] = await getDb().outbox.toArray();
    expect(volta.fields.deletedAt.para).toBeNull();
  });
});

describe('leitura', () => {
  it('esconde o que foi excluído e ordena como a tela mostra', async () => {
    const a = await createScene({ productionId: PRODUCAO, number: '2' });
    await createScene({ productionId: PRODUCAO, number: '10' });
    const morta = await createScene({ productionId: PRODUCAO, number: '3' });
    await softDelete('scene', morta);

    // Ordenação numérica: a cena 10 vem depois da 2, e não antes como no alfabético.
    expect((await listScenes(PRODUCAO)).map((cena) => cena.number)).toEqual(['2', '10']);
    expect((await listScenes(PRODUCAO)).map((cena) => cena.id)).toContain(a);
  });

  it('lista setups da diária por ordem e takes por número', async () => {
    const { sceneId, setupId } = await cenaComSetup();
    await createSetup({
      productionId: PRODUCAO,
      sceneId,
      shootingDayId: DIARIA,
      code: 'A',
      sortOrder: -1,
    });

    const setups = await listSetups(DIARIA);
    expect(setups.map((setup) => setup.code)).toEqual(['A', 'C']);

    await createTake({ productionId: PRODUCAO, setupId, number: 3 });
    await createTake({ productionId: PRODUCAO, setupId, number: 1 });
    expect((await listTakes([setupId])).map((take) => take.number)).toEqual([1, 3]);
    expect(await listTakes([])).toEqual([]);
  });
});

describe('fixação', () => {
  const snapshot = (overrides: Partial<SnapshotResponse> = {}): SnapshotResponse => ({
    protocol: 3,
    productionId: PRODUCAO,
    cursor: 42,
    shootingDay: { id: DIARIA, date: '2026-08-20', version: 1 },
    scenes: [{ id: 'cena-remota', number: '7', version: 2 }],
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
    members: [{ id: 'm1', userId: 'u1', name: 'Alice', department: 'CAMERA' }],
    ...overrides,
  });

  it('grava o dia, as cenas, os membros e o cursor', async () => {
    await pinShootingDay(snapshot());

    expect((await getDb().shootingDays.get(DIARIA))?.date).toBe('2026-08-20');
    expect((await getDb().scenes.get('cena-remota'))?.version).toBe(2);
    expect(await isPinned(DIARIA)).toBe(true);
    expect(await getMeta(`cursor:${PRODUCAO}`, 0)).toBe(42);
    expect(await getDb().refs.get(`members:${PRODUCAO}`)).toBeDefined();
  });

  it('não sobrescreve o que está sujo — fixar de novo não apaga o que foi digitado', async () => {
    await pinShootingDay(snapshot());
    await patchEntity('scene', 'cena-remota', { location: 'Praia de Copacabana' });

    await pinShootingDay(snapshot());

    expect((await getDb().scenes.get('cena-remota'))?.location).toBe(
      'Praia de Copacabana',
    );
  });

  it('não retrocede o cursor e não duplica a fixação', async () => {
    await pinShootingDay(snapshot());
    await pinShootingDay(snapshot({ cursor: 7 }));

    expect(await getMeta(`cursor:${PRODUCAO}`, 0)).toBe(42);
    expect(await getMeta<string[]>(PINS_KEY, [])).toEqual([DIARIA]);
  });

  it('desfixar tira só a diária pedida', async () => {
    await pinShootingDay(snapshot());
    await unpin(DIARIA);

    expect(await isPinned(DIARIA)).toBe(false);
    // O dado continua no aparelho: desfixar é parar de sincronizar, não apagar o dia.
    expect(await getDb().shootingDays.get(DIARIA)).toBeDefined();
  });
});
