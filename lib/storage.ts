import type { Boletim } from '@/types/boletim';
import { STORAGE_KEY, STORE_EVENT } from '@/lib/constants';
import { normalizeBoletim } from '@/lib/normalize';

/**
 * Camada de persistência: LocalStorage + reatividade.
 *
 * - 100% client-side; toda função é segura para SSR (checa `window`).
 * - Notifica mudanças via CustomEvent (mesma aba) e responde ao evento nativo
 *   `storage` (outras abas), mantendo as telas sincronizadas.
 */

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

export function loadAll(): Boletim[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeBoletim);
  } catch {
    return [];
  }
}

function persist(list: Boletim[]): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(STORE_EVENT));
}

export function saveAll(list: Boletim[]): void {
  persist(list);
}

export function getById(id: string): Boletim | undefined {
  return loadAll().find((boletim) => boletim.id === id);
}

/** Insere ou atualiza um boletim, sempre carimbando `updatedAt`. */
export function upsert(boletim: Boletim): Boletim {
  const stamped: Boletim = { ...boletim, updatedAt: new Date().toISOString() };
  const list = loadAll();
  const index = list.findIndex((item) => item.id === stamped.id);
  if (index >= 0) {
    list[index] = stamped;
  } else {
    list.unshift(stamped);
  }
  persist(list);
  return stamped;
}

export function remove(id: string): void {
  persist(loadAll().filter((boletim) => boletim.id !== id));
}

/** Substitui toda a base (usado no import de backup). */
export function replaceAll(list: Boletim[]): void {
  persist(list);
}

/**
 * Inscreve um callback nas mudanças da store (mesma aba + outras abas).
 * Retorna a função de cleanup.
 */
export function subscribe(callback: () => void): () => void {
  if (!hasWindow()) return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) callback();
  };
  window.addEventListener(STORE_EVENT, callback);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(STORE_EVENT, callback);
    window.removeEventListener('storage', onStorage);
  };
}
