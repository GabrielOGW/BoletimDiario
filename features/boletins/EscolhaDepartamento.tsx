'use client';

import { useEffect, useRef } from 'react';

import { CameraIcon, FileTextIcon, MicIcon, XIcon } from '@/components/ui/icons';
import { IconButton } from '@/components/ui/IconButton';
import {
  DEPARTAMENTOS_PRINCIPAIS,
  type ModuloDeDepartamento,
} from '@/features/diaria/departamentos';
import { cn } from '@/utils/cn';

const ICONE: Record<ModuloDeDepartamento, React.ReactNode> = {
  camera: <CameraIcon size={26} />,
  continuidade: <FileTextIcon size={26} />,
  som: <MicIcon size={26} />,
};

/**
 * "Novo boletim": a escolha do departamento (ADR-040, revisto por ADR-043).
 *
 * Os três boletins são **locais**: escolher cria o boletim neste aparelho e abre o editor —
 * sem conta, sem produção e sem diária. É uma camada sobre a lista, e não uma rota, para
 * abrir sempre, inclusive em modo avião.
 *
 * A cor é apoio; cada opção diz o nome por extenso.
 */
export function EscolhaDepartamento({
  aberta,
  onFechar,
  onEscolhe,
}: {
  aberta: boolean;
  onFechar: () => void;
  onEscolhe: (modulo: ModuloDeDepartamento) => void;
}) {
  const primeiro = useRef<HTMLButtonElement>(null);
  // Em ref: quem chama passa uma função nova a cada render, e o efeito devolveria o foco
  // ao primeiro botão a cada atualização da lista.
  const fecha = useRef(onFechar);
  fecha.current = onFechar;

  useEffect(() => {
    if (!aberta) return;
    primeiro.current?.focus();
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') fecha.current();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberta]);

  if (!aberta) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="escolha-departamento-titulo"
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/80 backdrop-blur-sm sm:items-center"
      onClick={onFechar}
    >
      <div
        className="w-full max-w-lg animate-slide-up rounded-t-3xl border border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
        onClick={(evento) => evento.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <h2
            id="escolha-departamento-titulo"
            className="flex-1 text-lg font-semibold text-zinc-100"
          >
            Novo boletim
          </h2>
          <IconButton label="Fechar" icon={<XIcon size={20} />} onClick={onFechar} />
        </div>

        <ul className="flex flex-col gap-3">
          {DEPARTAMENTOS_PRINCIPAIS.map((item, indice) => (
            <li key={item.modulo}>
              <button
                ref={indice === 0 ? primeiro : undefined}
                type="button"
                onClick={() => onEscolhe(item.modulo)}
                className={cn(
                  'flex min-h-[88px] w-full items-center gap-3 overflow-hidden rounded-2xl border bg-surface-raised p-0 text-left transition hover:bg-surface-hover',
                  item.cor.borda,
                )}
              >
                <span aria-hidden className={cn('w-1.5 self-stretch', item.cor.faixa)} />
                <span
                  aria-hidden
                  className={cn(
                    'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                    item.cor.fundo,
                    item.cor.texto,
                  )}
                >
                  {ICONE[item.modulo]}
                </span>
                <span className="min-w-0 flex-1 py-3 pr-3">
                  <span className="block text-base font-semibold text-zinc-100">
                    {item.nome}
                  </span>
                  <span className="block text-sm leading-snug text-zinc-400">
                    {item.descricao}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-center text-xs text-zinc-400">
          Tudo fica salvo neste aparelho e funciona offline.
        </p>
      </div>
    </div>
  );
}
