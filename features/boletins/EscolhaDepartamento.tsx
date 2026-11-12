'use client';

import { useEffect, useRef, useState } from 'react';

import { CameraIcon, FileTextIcon, MicIcon, XIcon } from '@/components/ui/icons';
import { IconButton } from '@/components/ui/IconButton';
import { ultimaDiaria, type AtalhoDeDiaria } from '@/lib/atalhos';
import {
  DEPARTAMENTOS_PRINCIPAIS,
  destinoDoModulo,
  type ModuloDeDepartamento,
} from '@/features/diaria/departamentos';
import { cn } from '@/utils/cn';

const ICONE: Record<ModuloDeDepartamento, React.ReactNode> = {
  camera: <CameraIcon size={26} />,
  continuidade: <FileTextIcon size={26} />,
  som: <MicIcon size={26} />,
};

/**
 * "Novo boletim": a escolha do departamento (ADR-040).
 *
 * Uma camada sobre a lista, e **não** uma rota: abrir uma rota nova pediria rede para
 * quem nunca a visitou, e esta é a primeira tela de quem está em set. Assim ela abre
 * sempre — inclusive em modo avião.
 *
 * - **Câmera** faz exatamente o que o botão fazia antes: cria o boletim local e abre o
 *   editor. Nenhum toque a mais além da escolha, nenhuma regra mudada.
 * - **Continuidade** e **Som** vivem numa diária da plataforma. O destino é a diária aberta
 *   por último neste aparelho, já no módulo certo — funciona sem rede porque ela está
 *   fixada; sem diária recente, `/hoje` encontra a de hoje (precisa de sinal, uma vez).
 *
 * Os outros setores não aparecem aqui (ADR-040): a escolha é entre três, e cada uma diz o
 * nome por extenso — a cor é apoio, nunca o rótulo.
 */
export function EscolhaDepartamento({
  aberta,
  onFechar,
  onCamera,
}: {
  aberta: boolean;
  onFechar: () => void;
  onCamera: () => void;
}) {
  const [atalho, setAtalho] = useState<AtalhoDeDiaria | null>(null);
  const [online, setOnline] = useState(true);
  const primeiro = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberta) return;
    setAtalho(ultimaDiaria());
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    primeiro.current?.focus();

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberta, onFechar]);

  if (!aberta) return null;

  function escolhe(modulo: ModuloDeDepartamento) {
    if (modulo === 'camera') {
      onCamera();
      return;
    }
    // `location` e não o roteador: sai do boletim local para a plataforma, duas camadas
    // de dados diferentes, e uma navegação de verdade garante que o destino comece limpo
    // (o mesmo motivo do botão "Continuar", ContinuarDiaria).
    window.location.href = destinoDoModulo(modulo, atalho);
  }

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
          {DEPARTAMENTOS_PRINCIPAIS.map((item, indice) => {
            const naPlataforma = item.modulo !== 'camera';
            const aviso = !naPlataforma
              ? 'Neste aparelho, funciona offline.'
              : atalho
                ? `Abre em ${atalho.producao} · ${atalho.diaria}`
                : online
                  ? 'Na diária de hoje da sua produção.'
                  : 'Precisa de conexão para abrir a diária pela primeira vez.';

            return (
              <li key={item.modulo}>
                <button
                  ref={indice === 0 ? primeiro : undefined}
                  type="button"
                  onClick={() => escolhe(item.modulo)}
                  className={cn(
                    'flex min-h-[88px] w-full items-center gap-3 overflow-hidden rounded-2xl border bg-surface-raised p-0 text-left transition hover:bg-surface-hover',
                    item.cor.borda,
                  )}
                >
                  <span
                    aria-hidden
                    className={cn('w-1.5 self-stretch', item.cor.faixa)}
                  />
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
                    <span className={cn('mt-1 block text-xs', item.cor.texto)}>
                      {aviso}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {atalho ? (
          <p className="mt-3 text-center text-xs text-zinc-400">
            Outra diária?{' '}
            <a href="/producoes" className="text-zinc-200 underline underline-offset-2">
              Escolher na lista de produções
            </a>
          </p>
        ) : null}
      </div>
    </div>
  );
}
