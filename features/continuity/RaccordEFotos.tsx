'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DebouncedTextField } from '@/components/ui/DebouncedTextField';
import { IconButton } from '@/components/ui/IconButton';
import { OptionChips, type OptionChip } from '@/components/ui/OptionChips';
import { TextField } from '@/components/ui/TextField';
import {
  CameraIcon,
  ChevronDownIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from '@/components/ui/icons';
import type { LocalContinuityPhoto } from '@/lib/offline/db';
import {
  createNota,
  getFotoBlob,
  getFotoBlobs,
  listFotos,
  listNotas,
  patchFoto,
  patchNota,
  removeFoto,
  removeNota,
  salvaFoto,
} from '@/lib/offline/repos/continuidade';
import { syncNow } from '@/lib/sync/engine';
import { baixaFoto } from '@/lib/sync/fotos';
import { cn } from '@/utils/cn';
import { cabeNoAparelho, comprimeImagem, pedePersistencia } from '@/utils/imagem';

import {
  CATEGORIAS_DE_FOTO,
  CATEGORIAS_DE_NOTA,
  rotuloDaCategoriaDeFoto,
  rotuloDaCategoriaDeNota,
} from './raccord';

const NOTAS: OptionChip[] = CATEGORIAS_DE_NOTA.map((item) => ({
  valor: item.codigo,
  rotulo: item.rotulo,
}));

const FOTOS: OptionChip[] = CATEGORIAS_DE_FOTO.map((item) => ({
  valor: item.codigo,
  rotulo: item.rotulo,
}));

export interface EscopoDoRaccord {
  /** Exatamente um dos três: a nota ou foto fica presa a este nível (ADR-042). */
  sceneId?: string;
  setupId?: string;
  takeId?: string;
}

/**
 * Notas de raccord e fotografias de continuidade, presas a **um** nível — cena, plano ou
 * take (ADR-042).
 *
 * O mesmo componente nos três níveis, porque o gesto é o mesmo: escolher a categoria num
 * toque, escrever, e (se for o caso) fotografar. Fechado por padrão com a contagem no
 * rótulo — o cartão do take continua cabendo na tela, e quem anotou vê de relance que há
 * algo ali.
 *
 * As fotos são comprimidas **no aparelho** antes de gravar (JPEG ≤ 1600 px), guardadas no
 * banco local junto com o registro e sobem sozinhas quando houver sinal. Nada aqui
 * depende de rede: tirar, ver e apagar funcionam em modo avião.
 */
export function RaccordEFotos({
  productionId,
  escopo,
  canEdit,
  rotulo = 'Raccord e fotos',
}: {
  productionId: string;
  escopo: EscopoDoRaccord;
  canEdit: boolean;
  rotulo?: string;
}) {
  const [aberto, setAberto] = useState(false);

  const chave = escopo.takeId ?? escopo.setupId ?? escopo.sceneId ?? '';
  const filtro = {
    sceneIds: escopo.sceneId ? [escopo.sceneId] : undefined,
    setupIds: escopo.setupId ? [escopo.setupId] : undefined,
    takeIds: escopo.takeId ? [escopo.takeId] : undefined,
  };

  // Só o que está preso **a este nível**: a nota da cena não se repete em cada take.
  const notas = useLiveQuery(
    async () => (await listNotas(filtro)).filter((nota) => mesmoNivel(nota, escopo)),
    [chave],
    [],
  );
  const fotos = useLiveQuery(
    async () => (await listFotos(filtro)).filter((foto) => mesmoNivel(foto, escopo)),
    [chave],
    [],
  );

  const total = (notas?.length ?? 0) + (fotos?.length ?? 0);

  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((valor) => !valor)}
        className="flex min-h-[44px] w-full items-center gap-2 text-xs text-zinc-400 hover:text-zinc-300"
      >
        <ChevronDownIcon size={14} className={cn('transition', aberto && 'rotate-180')} />
        {rotulo}
        {total > 0 ? (
          <span className="text-sky-400">
            {[
              notas?.length ? `${notas.length} nota(s)` : '',
              fotos?.length ? `${fotos.length} foto(s)` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        ) : null}
      </button>

      {aberto ? (
        <div className="mt-1 flex flex-col gap-3 rounded-xl border border-sky-500/30 bg-surface p-3">
          {(notas ?? []).map((nota) => (
            <div
              key={nota.id}
              className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-2.5"
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-300">
                  {rotuloDaCategoriaDeNota(nota.category)}
                </span>
                {nota._dirty ? <Badge tone="muted">não enviado</Badge> : null}
                <span className="flex-1" />
                {canEdit ? (
                  <IconButton
                    label="Remover nota"
                    variant="danger"
                    icon={<TrashIcon size={16} />}
                    onClick={() => void removeNota(nota.id).then(syncNow)}
                  />
                ) : null}
              </div>
              <DebouncedTextField
                label="Nota"
                multiline
                value={nota.note ?? ''}
                disabled={!canEdit}
                onCommit={(valor) =>
                  void patchNota(nota.id, { note: valor || null }).then(syncNow)
                }
              />
            </div>
          ))}

          {canEdit ? <NovaNota productionId={productionId} escopo={escopo} /> : null}

          <GradeDeFotos
            productionId={productionId}
            fotos={fotos ?? []}
            canEdit={canEdit}
          />

          {canEdit ? <NovaFoto productionId={productionId} escopo={escopo} /> : null}

          {!canEdit && total === 0 ? (
            <p className="text-xs text-zinc-400">Nada anotado aqui.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function mesmoNivel(
  item: { sceneId?: string | null; setupId?: string | null; takeId?: string | null },
  escopo: EscopoDoRaccord,
): boolean {
  if (escopo.takeId) return item.takeId === escopo.takeId;
  if (escopo.setupId) return item.setupId === escopo.setupId && !item.takeId;
  return item.sceneId === escopo.sceneId && !item.setupId && !item.takeId;
}

function NovaNota({
  productionId,
  escopo,
}: {
  productionId: string;
  escopo: EscopoDoRaccord;
}) {
  const [categoria, setCategoria] = useState<string | null>(null);
  const [texto, setTexto] = useState('');

  return (
    <div className="flex flex-col gap-2">
      <OptionChips
        label="Categoria da nota"
        size="sm"
        className="flex-wrap"
        options={NOTAS}
        value={categoria}
        onChange={setCategoria}
      />
      <div className="flex items-end gap-2">
        <TextField
          label="Nova nota de raccord"
          className="flex-1"
          value={texto}
          onChange={setTexto}
          placeholder="Maria olha para a janela à esquerda"
        />
        <Button
          variant="secondary"
          leftIcon={<PlusIcon size={16} />}
          disabled={!texto.trim()}
          onClick={async () => {
            await createNota({
              productionId,
              ...escopo,
              category: categoria,
              note: texto.trim(),
            });
            setTexto('');
            syncNow();
          }}
        >
          Anotar
        </Button>
      </div>
    </div>
  );
}

function NovaFoto({
  productionId,
  escopo,
}: {
  productionId: string;
  escopo: EscopoDoRaccord;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [estado, setEstado] = useState<'PRONTO' | 'PROCESSANDO'>('PRONTO');
  const [erro, setErro] = useState<string | null>(null);

  async function aoEscolher(arquivos: FileList | null) {
    if (!arquivos || arquivos.length === 0) return;
    setErro(null);
    setEstado('PROCESSANDO');

    try {
      void pedePersistencia();
      for (const arquivo of Array.from(arquivos)) {
        const imagem = await comprimeImagem(arquivo);
        if (!(await cabeNoAparelho(imagem.bytes.byteLength))) {
          setErro(
            'Pouco espaço livre neste aparelho. Sincronize com sinal e libere espaço antes de tirar mais fotos.',
          );
          break;
        }
        await salvaFoto({
          productionId,
          ...escopo,
          category: categoria,
          mimeType: imagem.mimeType,
          bytes: imagem.bytes,
          width: imagem.largura,
          height: imagem.altura,
        });
      }
      syncNow();
    } catch (falha) {
      setErro(
        falha instanceof Error && falha.name === 'QuotaExceededError'
          ? 'O armazenamento deste aparelho está cheio. A foto não foi salva.'
          : 'Não foi possível salvar a foto. Tente de novo.',
      );
    } finally {
      setEstado('PRONTO');
      if (entrada.current) entrada.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <OptionChips
        label="Categoria da foto"
        size="sm"
        className="flex-wrap"
        options={FOTOS}
        value={categoria}
        onChange={setCategoria}
      />
      {/* Sem `capture`: o sistema oferece câmera **e** galeria — a foto de referência às
          vezes já foi tirada com o app de câmera, antes de abrir o boletim. */}
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(evento) => void aoEscolher(evento.target.files)}
      />
      <Button
        variant="secondary"
        leftIcon={<CameraIcon size={16} />}
        disabled={estado === 'PROCESSANDO'}
        onClick={() => entrada.current?.click()}
      >
        {estado === 'PROCESSANDO' ? 'Salvando foto…' : 'Tirar / anexar foto'}
      </Button>
      {erro ? (
        <p role="alert" className="text-xs text-amber-400">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

function GradeDeFotos({
  productionId,
  fotos,
  canEdit,
}: {
  productionId: string;
  fotos: LocalContinuityPhoto[];
  canEdit: boolean;
}) {
  const [aberta, setAberta] = useState<LocalContinuityPhoto | null>(null);

  if (fotos.length === 0) return null;

  return (
    <>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {fotos.map((foto) => (
          <li key={foto.id}>
            <button
              type="button"
              onClick={() => setAberta(foto)}
              className="block w-full overflow-hidden rounded-lg border border-line bg-surface-raised text-left"
              aria-label={`Abrir foto: ${rotuloDaCategoriaDeFoto(foto.category)}${foto.caption ? ` — ${foto.caption}` : ''}`}
            >
              <Miniatura
                productionId={productionId}
                foto={foto}
                className="aspect-square"
              />
              <span className="block truncate px-1.5 py-1 text-[11px] text-zinc-300">
                {foto.caption || rotuloDaCategoriaDeFoto(foto.category)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {aberta ? (
        <FotoAberta
          productionId={productionId}
          foto={fotos.find((foto) => foto.id === aberta.id) ?? aberta}
          canEdit={canEdit}
          onFechar={() => setAberta(null)}
        />
      ) : null}
    </>
  );
}

/**
 * A imagem de uma foto, a partir dos bytes do banco local.
 *
 * Sem os bytes — foto tirada em outro aparelho que ainda não desceu — pede o download uma
 * vez e mostra o porquê da ausência, em vez de um quadrado vazio que parece defeito.
 */
export function Miniatura({
  productionId,
  foto,
  className,
}: {
  productionId: string;
  foto: { id: string; caption?: string | null };
  className?: string;
}) {
  const blob = useLiveQuery(() => getFotoBlob(foto.id), [foto.id], undefined);
  const [url, setUrl] = useState<string | null>(null);
  const pedido = useRef(false);

  useEffect(() => {
    if (!blob) return;
    const endereco = URL.createObjectURL(new Blob([blob.bytes], { type: blob.mimeType }));
    setUrl(endereco);
    return () => URL.revokeObjectURL(endereco);
  }, [blob]);

  useEffect(() => {
    if (blob || pedido.current) return;
    pedido.current = true;
    void baixaFoto(productionId, foto.id);
  }, [blob, productionId, foto.id]);

  if (!url) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-surface p-2 text-center text-[11px] leading-tight text-zinc-400',
          className,
        )}
      >
        Foto ainda não baixada
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- bytes locais via object URL; next/image não serve blob:
    <img
      src={url}
      alt={foto.caption || 'Foto de continuidade'}
      className={cn('w-full object-cover', className)}
    />
  );
}

function FotoAberta({
  productionId,
  foto,
  canEdit,
  onFechar,
}: {
  productionId: string;
  foto: LocalContinuityPhoto;
  canEdit: boolean;
  onFechar: () => void;
}) {
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Foto de continuidade"
      className="fixed inset-0 z-50 overflow-y-auto bg-ink/95 p-3"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm font-semibold text-zinc-100">
            {rotuloDaCategoriaDeFoto(foto.category)}
          </span>
          {foto._dirty ? <Badge tone="muted">não enviada</Badge> : null}
          <IconButton label="Fechar" icon={<XIcon size={20} />} onClick={onFechar} />
        </div>

        <Miniatura productionId={productionId} foto={foto} className="rounded-xl" />

        <OptionChips
          label="Categoria da foto"
          size="sm"
          className="flex-wrap"
          options={FOTOS}
          value={foto.category ?? null}
          disabled={!canEdit}
          onChange={(valor) => void patchFoto(foto.id, { category: valor }).then(syncNow)}
        />
        <DebouncedTextField
          label="Legenda"
          value={foto.caption ?? ''}
          disabled={!canEdit}
          placeholder="Copo pela metade, mão direita"
          onCommit={(valor) =>
            void patchFoto(foto.id, { caption: valor || null }).then(syncNow)
          }
        />

        {canEdit ? (
          <Button
            variant="danger"
            leftIcon={<TrashIcon size={16} />}
            onClick={async () => {
              await removeFoto(foto.id);
              syncNow();
              onFechar();
            }}
          >
            Apagar foto
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * `photoId → object URL` para a folha impressa, a partir dos bytes do banco local.
 *
 * As URLs são revogadas quando a lista muda ou a folha fecha: cada uma segura a imagem
 * inteira na memória, e uma diária com quarenta fotos aberta duas vezes seriam oitenta.
 */
export function useUrlsDasFotos(ids: readonly string[]): Record<string, string> {
  const chave = ids.join(',');
  const blobs = useLiveQuery(() => getFotoBlobs([...ids]), [chave], []);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const novas: Record<string, string> = {};
    for (const blob of blobs ?? []) {
      novas[blob.id] = URL.createObjectURL(
        new Blob([blob.bytes], { type: blob.mimeType }),
      );
    }
    setUrls(novas);
    return () => {
      for (const url of Object.values(novas)) URL.revokeObjectURL(url);
    };
  }, [blobs]);

  return urls;
}
