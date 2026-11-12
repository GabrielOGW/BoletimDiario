/**
 * Os bytes das fotos do Boletim de Continuidade **local** (ADR-043).
 *
 * IndexedDB e não LocalStorage: o LocalStorage tem cerca de 5 MB por origem, é síncrono e
 * só guarda texto — três fotos em base64 o encheriam, e os boletins de câmera dividem o
 * mesmo espaço. O boletim guarda só a referência (`FotoLocal`); os bytes moram aqui, pelo id.
 *
 * Um banco próprio (`bdc-fotos-locais`), separado do banco da plataforma (`bdc-platform`):
 * o boletim local não tem conta, não tem sync e não pode depender do schema de um banco que
 * existe para outra coisa.
 */

import Dexie, { type Table } from 'dexie';

export interface FotoBytes {
  id: string;
  boletimId: string;
  mimeType: string;
  bytes: ArrayBuffer;
}

class BancoDeFotos extends Dexie {
  fotos!: Table<FotoBytes, string>;

  constructor() {
    super('bdc-fotos-locais');
    this.version(1).stores({ fotos: 'id, boletimId' });
  }
}

let instancia: BancoDeFotos | null = null;

function banco(): BancoDeFotos {
  if (typeof indexedDB === 'undefined') {
    throw new Error('O armazenamento de fotos só existe no navegador.');
  }
  instancia ??= new BancoDeFotos();
  return instancia;
}

export async function guardaFoto(foto: FotoBytes): Promise<void> {
  await banco().fotos.put(foto);
}

export async function leFoto(id: string): Promise<FotoBytes | undefined> {
  return banco().fotos.get(id);
}

export async function leFotos(ids: string[]): Promise<FotoBytes[]> {
  if (ids.length === 0) return [];
  const achadas = await banco().fotos.bulkGet(ids);
  return achadas.filter((foto): foto is FotoBytes => foto !== undefined);
}

export async function apagaFoto(id: string): Promise<void> {
  await banco().fotos.delete(id);
}

/** Apagar o boletim apaga as fotos dele — senão viram espaço ocupado que ninguém vê. */
export async function apagaFotosDoBoletim(boletimId: string): Promise<void> {
  await banco().fotos.where('boletimId').equals(boletimId).delete();
}

/**
 * Copia os bytes de fotos para ids novos, de outro boletim — a parte de I/O da duplicação
 * do Boletim de Continuidade. Foto que não está no aparelho é pulada: a cópia mostra
 * "foto não encontrada", como o original mostraria.
 */
export async function copiaFotos(
  mapa: { de: string; para: string }[],
  boletimId: string,
): Promise<void> {
  if (mapa.length === 0) return;
  const db = banco();
  await db.transaction('rw', db.fotos, async () => {
    const originais = await db.fotos.bulkGet(mapa.map((item) => item.de));
    const novas = mapa.flatMap((item, indice) => {
      const original = originais[indice];
      return original ? [{ ...original, id: item.para, boletimId }] : [];
    });
    await db.fotos.bulkPut(novas);
  });
}
