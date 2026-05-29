'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Boletim } from '@/types/boletim';
import { getById, upsert } from '@/lib/storage';

type LoadStatus = 'loading' | 'ready' | 'not-found';
export type SaveState = 'idle' | 'saving' | 'saved';

const DEBOUNCE_MS = 500;

interface UseBoletimResult {
  boletim: Boletim | null;
  status: LoadStatus;
  saveState: SaveState;
  /** Atualiza o boletim em memória; o salvamento é automático (debounced). */
  update: (updater: (prev: Boletim) => Boletim) => void;
}

/**
 * Carrega um boletim por id e mantém auto-save no LocalStorage.
 * - Debounce de 500ms enquanto o usuário digita.
 * - Flush imediato ao desmontar (não perde os últimos toques).
 */
export function useBoletim(id: string | null): UseBoletimResult {
  const [boletim, setBoletim] = useState<Boletim | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const dirty = useRef(false);
  const latest = useRef<Boletim | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  latest.current = boletim;

  useEffect(() => {
    if (!id) {
      setStatus('not-found');
      return;
    }
    const found = getById(id);
    if (found) {
      setBoletim(found);
      setStatus('ready');
    } else {
      setStatus('not-found');
    }
  }, [id]);

  const update = useCallback((updater: (prev: Boletim) => Boletim) => {
    dirty.current = true;
    setBoletim((prev) => (prev ? updater(prev) : prev));
  }, []);

  // Auto-save com debounce sempre que o boletim muda por edição.
  useEffect(() => {
    if (!boletim || !dirty.current) return;
    setSaveState('saving');
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      upsert(boletim);
      dirty.current = false;
      setSaveState('saved');
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveState('idle'), 1500);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [boletim]);

  // Flush ao desmontar a tela.
  useEffect(() => {
    return () => {
      if (dirty.current && latest.current) {
        upsert(latest.current);
        dirty.current = false;
      }
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  return { boletim, status, saveState, update };
}
