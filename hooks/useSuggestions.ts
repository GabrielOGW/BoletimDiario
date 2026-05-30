'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { CameraCadastrada } from '@/types/boletim';
import {
  collectSuggestions,
  emptySuggestions,
  type Suggestions,
} from '@/lib/suggestions';

/** Metadados do editor compartilhados com componentes profundos (sem prop-drilling). */
export interface EditorMeta {
  /** Câmeras cadastradas do boletim atual (para o seletor de câmera do plano). */
  cameras: CameraCadastrada[];
  /** Sugestões de autocomplete baseadas no uso. */
  suggestions: Suggestions;
}

const EditorMetaContext = createContext<EditorMeta>({
  cameras: [],
  suggestions: emptySuggestions(),
});

export const EditorMetaProvider = EditorMetaContext.Provider;

export function useEditorMeta(): EditorMeta {
  return useContext(EditorMetaContext);
}

/** Coleta as sugestões a partir de todos os boletins, uma vez na montagem. */
export function useCollectedSuggestions(): Suggestions {
  const [suggestions, setSuggestions] = useState<Suggestions>(emptySuggestions);
  useEffect(() => {
    setSuggestions(collectSuggestions());
  }, []);
  return suggestions;
}
