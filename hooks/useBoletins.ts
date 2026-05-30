'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Boletim } from '@/types/boletim';
import { createEmptyBoletim, duplicateBoletim } from '@/lib/factory';
import { loadAll, remove as removeFromStore, subscribe, upsert } from '@/lib/storage';
import { boletimTitle } from '@/utils/boletim-stats';

function matchesQuery(boletim: Boletim, query: string): boolean {
  if (!query) return true;
  const haystack = [
    boletim.producao.tituloProjeto,
    boletim.producao.produtora,
    boletim.producao.diretor,
    boletim.producao.diretorFotografia,
    boletim.producao.data,
    boletim.producao.diaDiaria,
    ...boletim.camerasCadastradas.map((cam) => `${cam.nomeId} ${cam.modelo}`),
    ...boletim.cenas.map((cena) => cena.numero),
  ]
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

interface UseBoletinsResult {
  all: Boletim[];
  results: Boletim[];
  query: string;
  setQuery: (value: string) => void;
  loaded: boolean;
  create: () => Boletim;
  duplicate: (id: string) => Boletim | undefined;
  remove: (id: string) => void;
}

/** Lista reativa de boletins com busca e ações de CRUD. */
export function useBoletins(): UseBoletinsResult {
  const [all, setAll] = useState<Boletim[]>([]);
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    const list = loadAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    setAll(list);
    setLoaded(true);
  }, []);

  useEffect(() => {
    refresh();
    return subscribe(refresh);
  }, [refresh]);

  const create = useCallback(() => {
    const boletim = createEmptyBoletim();
    return upsert(boletim);
  }, []);

  const duplicate = useCallback((id: string) => {
    const original = loadAll().find((item) => item.id === id);
    if (!original) return undefined;
    return upsert(duplicateBoletim(original));
  }, []);

  const remove = useCallback((id: string) => {
    removeFromStore(id);
  }, []);

  const results = useMemo(
    () => all.filter((boletim) => matchesQuery(boletim, query)),
    [all, query],
  );

  return { all, results, query, setQuery, loaded, create, duplicate, remove };
}

export { boletimTitle };
