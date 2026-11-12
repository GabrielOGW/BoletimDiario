/**
 * Persistência dos boletins locais de Som e Continuidade (ADR-043) — o mesmo mecanismo do
 * Boletim de Câmera (`lib/storage.ts`), uma chave de LocalStorage por departamento.
 *
 * Chaves separadas, e não a lista da Câmera: `normalizeBoletim()` transforma qualquer JSON
 * num boletim **de câmera**, e um boletim de som guardado ali viraria, na primeira leitura,
 * um boletim de câmera vazio — com o som perdido.
 *
 * Toda leitura passa pela normalização do departamento; toda escrita avisa as telas (mesma
 * aba pelo evento da store, outras abas pelo `storage` nativo).
 */

import { STORE_EVENT } from '@/lib/constants';

import { normalizaBoletimContinuidade, type BoletimContinuidade } from './continuidade';
import { normalizaBoletimSom, type BoletimSom } from './som';

export const CHAVE_SOM = 'bdc:boletins-som:v1';
export const CHAVE_CONTINUIDADE = 'bdc:boletins-continuidade:v1';

export interface StoreLocal<T extends { id: string; updatedAt: string }> {
  chave: string;
  loadAll: () => T[];
  getById: (id: string) => T | undefined;
  upsert: (boletim: T) => T;
  remove: (id: string) => void;
  subscribe: (callback: () => void) => () => void;
}

function criaStore<T extends { id: string; updatedAt: string }>(
  chave: string,
  normaliza: (valor: unknown) => T,
): StoreLocal<T> {
  const temJanela = () => typeof window !== 'undefined';

  function loadAll(): T[] {
    if (!temJanela()) return [];
    try {
      const bruto = window.localStorage.getItem(chave);
      if (!bruto) return [];
      const lido: unknown = JSON.parse(bruto);
      return Array.isArray(lido) ? lido.map(normaliza) : [];
    } catch {
      return [];
    }
  }

  function persiste(lista: T[]): void {
    if (!temJanela()) return;
    window.localStorage.setItem(chave, JSON.stringify(lista));
    window.dispatchEvent(new CustomEvent(STORE_EVENT));
  }

  return {
    chave,
    loadAll,
    getById: (id) => loadAll().find((item) => item.id === id),
    upsert(boletim) {
      const carimbado = { ...boletim, updatedAt: new Date().toISOString() };
      const lista = loadAll();
      const indice = lista.findIndex((item) => item.id === carimbado.id);
      if (indice >= 0) lista[indice] = carimbado;
      else lista.unshift(carimbado);
      persiste(lista);
      return carimbado;
    },
    remove: (id) => persiste(loadAll().filter((item) => item.id !== id)),
    subscribe(callback) {
      if (!temJanela()) return () => {};
      const aoMudar = (evento: StorageEvent) => {
        if (evento.key === null || evento.key === chave) callback();
      };
      window.addEventListener(STORE_EVENT, callback);
      window.addEventListener('storage', aoMudar);
      return () => {
        window.removeEventListener(STORE_EVENT, callback);
        window.removeEventListener('storage', aoMudar);
      };
    },
  };
}

export const storeSom: StoreLocal<BoletimSom> = criaStore(CHAVE_SOM, normalizaBoletimSom);

export const storeContinuidade: StoreLocal<BoletimContinuidade> = criaStore(
  CHAVE_CONTINUIDADE,
  normalizaBoletimContinuidade,
);
