'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { StoreLocal } from '@/lib/local/store';

import type { SaveState } from './useBoletim';

type Status = 'loading' | 'ready' | 'not-found';

/**
 * O contrato de edição do Boletim de Câmera (`useBoletim`), para os boletins locais de Som
 * e Continuidade: carrega por id, `update(prev => next)` é o único caminho de mutação,
 * salva sozinho com 500 ms de debounce e grava na hora ao sair da tela — nenhuma tecla
 * perdida, nenhum botão salvar.
 */
export function useBoletimLocal<T extends { id: string; updatedAt: string }>(
  store: StoreLocal<T>,
  id: string | null,
) {
  const [boletim, setBoletim] = useState<T | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const sujo = useRef(false);
  const ultimo = useRef<T | null>(null);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const salvo = useRef<ReturnType<typeof setTimeout> | null>(null);
  ultimo.current = boletim;

  useEffect(() => {
    if (!id) {
      setStatus('not-found');
      return;
    }
    const achado = store.getById(id);
    if (achado) {
      setBoletim(achado);
      setStatus('ready');
    } else {
      setStatus('not-found');
    }
  }, [id, store]);

  const update = useCallback((atualiza: (anterior: T) => T) => {
    sujo.current = true;
    setBoletim((anterior) => (anterior ? atualiza(anterior) : anterior));
  }, []);

  useEffect(() => {
    if (!boletim || !sujo.current) return;
    setSaveState('saving');
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => {
      store.upsert(boletim);
      sujo.current = false;
      setSaveState('saved');
      if (salvo.current) clearTimeout(salvo.current);
      salvo.current = setTimeout(() => setSaveState('idle'), 1500);
    }, 500);
    return () => {
      if (espera.current) clearTimeout(espera.current);
    };
  }, [boletim, store]);

  // Também grava ao esconder a aba: no celular, "sair" do app quase nunca desmonta a tela.
  useEffect(() => {
    const grava = () => {
      if (sujo.current && ultimo.current) {
        store.upsert(ultimo.current);
        sujo.current = false;
      }
    };
    const aoEsconder = () => {
      if (document.visibilityState === 'hidden') grava();
    };
    document.addEventListener('visibilitychange', aoEsconder);
    return () => {
      document.removeEventListener('visibilitychange', aoEsconder);
      grava();
      if (salvo.current) clearTimeout(salvo.current);
    };
  }, [store]);

  return { boletim, status, saveState, update };
}

/** Lista reativa de um store local, mais recentes primeiro. */
export function useListaLocal<T extends { id: string; updatedAt: string }>(
  store: StoreLocal<T>,
): { lista: T[]; carregada: boolean } {
  const [lista, setLista] = useState<T[]>([]);
  const [carregada, setCarregada] = useState(false);

  useEffect(() => {
    const atualiza = () => {
      setLista(store.loadAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setCarregada(true);
    };
    atualiza();
    return store.subscribe(atualiza);
  }, [store]);

  return { lista, carregada };
}
