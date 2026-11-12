/**
 * Os bytes das fotos do Boletim de Continuidade local (ADR-043), sobre IndexedDB real.
 *
 * O boletim guarda só a referência; se os bytes não voltarem iguais, ou não forem embora
 * junto com o boletim, o aparelho acumula fotos que ninguém vê — e o espaço que falta
 * depois é o da diária seguinte.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  apagaFoto,
  apagaFotosDoBoletim,
  guardaFoto,
  leFoto,
  leFotos,
} from '@/lib/local/fotos';

const bytes = (n: number, valor = 7) => new Uint8Array(n).fill(valor).buffer;

beforeEach(async () => {
  await apagaFotosDoBoletim('b1');
  await apagaFotosDoBoletim('b2');
});

describe('fotos locais', () => {
  it('guarda e devolve os mesmos bytes', async () => {
    await guardaFoto({ id: 'f1', boletimId: 'b1', mimeType: 'image/jpeg', bytes: bytes(10, 3) });
    const foto = await leFoto('f1');
    expect(foto?.mimeType).toBe('image/jpeg');
    expect([...new Uint8Array(foto?.bytes ?? new ArrayBuffer(0))]).toEqual(Array(10).fill(3));
  });

  it('lê várias, ignorando as que não existem', async () => {
    await guardaFoto({ id: 'f1', boletimId: 'b1', mimeType: 'image/jpeg', bytes: bytes(1) });
    await guardaFoto({ id: 'f2', boletimId: 'b1', mimeType: 'image/jpeg', bytes: bytes(1) });
    const fotos = await leFotos(['f1', 'nao-existe', 'f2']);
    expect(fotos.map((foto) => foto.id)).toEqual(['f1', 'f2']);
    expect(await leFotos([])).toEqual([]);
  });

  it('apagar o boletim apaga só as fotos dele', async () => {
    await guardaFoto({ id: 'f1', boletimId: 'b1', mimeType: 'image/jpeg', bytes: bytes(1) });
    await guardaFoto({ id: 'f2', boletimId: 'b2', mimeType: 'image/jpeg', bytes: bytes(1) });
    await apagaFotosDoBoletim('b1');
    expect(await leFoto('f1')).toBeUndefined();
    expect(await leFoto('f2')).toBeDefined();
  });

  it('apaga uma foto', async () => {
    await guardaFoto({ id: 'f1', boletimId: 'b1', mimeType: 'image/jpeg', bytes: bytes(1) });
    await apagaFoto('f1');
    expect(await leFoto('f1')).toBeUndefined();
  });
});
