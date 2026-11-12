'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
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
import { novoId, type FotoLocal, type NotaLocal } from '@/lib/local/comum';
import { apagaFoto, guardaFoto, leFoto, leFotos } from '@/lib/local/fotos';
import { cn } from '@/utils/cn';
import { cabeNoAparelho, comprimeImagem, pedePersistencia } from '@/utils/imagem';

import {
  CATEGORIAS_DE_FOTO,
  CATEGORIAS_DE_NOTA,
  rotuloDaCategoriaDeFoto,
  rotuloDaCategoriaDeNota,
} from '@/features/continuity/raccord';

const NOTAS: OptionChip[] = CATEGORIAS_DE_NOTA.map((item) => ({
  valor: item.codigo,
  rotulo: item.rotulo,
}));

const FOTOS: OptionChip[] = CATEGORIAS_DE_FOTO.map((item) => ({
  valor: item.codigo,
  rotulo: item.rotulo,
}));

/**
 * Notas de raccord e fotografias de um nível — cena, plano ou take — do boletim local.
 *
 * Fechado por padrão, com a contagem no rótulo: o cartão continua cabendo na tela, e quem
 * anotou vê de relance que há algo ali. A foto é comprimida no aparelho (JPEG ≤ 1600 px)
 * e os bytes vão para o IndexedDB; o boletim guarda só a referência.
 */
export function NotasEFotos({
  boletimId,
  rotulo,
  notas,
  fotos,
  onNotas,
  onFotos,
}: {
  boletimId: string;
  rotulo: string;
  notas: NotaLocal[];
  fotos: FotoLocal[];
  onNotas: (notas: NotaLocal[]) => void;
  onFotos: (fotos: FotoLocal[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const total = notas.length + fotos.length;

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
              notas.length ? `${notas.length} nota(s)` : '',
              fotos.length ? `${fotos.length} foto(s)` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        ) : null}
      </button>

      {aberto ? (
        <div className="mt-1 flex flex-col gap-3 rounded-xl border border-sky-500/30 bg-surface p-3">
          {notas.map((nota) => (
            <div
              key={nota.id}
              className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-2.5"
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-300">
                  {rotuloDaCategoriaDeNota(nota.categoria)}
                </span>
                <span className="flex-1" />
                <IconButton
                  label="Remover nota"
                  variant="danger"
                  icon={<TrashIcon size={16} />}
                  onClick={() => onNotas(notas.filter((item) => item.id !== nota.id))}
                />
              </div>
              <TextField
                label="Nota"
                value={nota.texto}
                onChange={(valor) =>
                  onNotas(
                    notas.map((item) =>
                      item.id === nota.id ? { ...item, texto: valor } : item,
                    ),
                  )
                }
              />
            </div>
          ))}

          <NovaNota onCria={(nota) => onNotas([...notas, nota])} />

          <GradeDeFotos
            fotos={fotos}
            onAltera={(foto) =>
              onFotos(fotos.map((item) => (item.id === foto.id ? foto : item)))
            }
            onApaga={(id) => {
              void apagaFoto(id);
              onFotos(fotos.filter((item) => item.id !== id));
            }}
          />

          <NovaFoto boletimId={boletimId} onCria={(foto) => onFotos([...fotos, foto])} />
        </div>
      ) : null}
    </div>
  );
}

function NovaNota({ onCria }: { onCria: (nota: NotaLocal) => void }) {
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
          onClick={() => {
            onCria({
              id: novoId('nota'),
              categoria: categoria ?? '',
              texto: texto.trim(),
            });
            setTexto('');
          }}
        >
          Anotar
        </Button>
      </div>
    </div>
  );
}

function NovaFoto({
  boletimId,
  onCria,
}: {
  boletimId: string;
  onCria: (foto: FotoLocal) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aoEscolher(arquivos: FileList | null) {
    if (!arquivos || arquivos.length === 0) return;
    setErro(null);
    setOcupado(true);
    try {
      void pedePersistencia();
      for (const arquivo of Array.from(arquivos)) {
        const imagem = await comprimeImagem(arquivo);
        if (!(await cabeNoAparelho(imagem.bytes.byteLength))) {
          setErro('Pouco espaço livre neste aparelho. A foto não foi salva.');
          break;
        }
        const id = novoId('foto');
        // Os bytes primeiro: se gravar falhar, o boletim não fica com uma foto fantasma.
        await guardaFoto({
          id,
          boletimId,
          mimeType: imagem.mimeType,
          bytes: imagem.bytes,
        });
        onCria({
          id,
          categoria: categoria ?? '',
          legenda: '',
          largura: String(imagem.largura),
          altura: String(imagem.altura),
        });
      }
    } catch (falha) {
      setErro(
        falha instanceof Error && falha.name === 'QuotaExceededError'
          ? 'O armazenamento deste aparelho está cheio. A foto não foi salva.'
          : 'Não foi possível salvar a foto. Tente de novo.',
      );
    } finally {
      setOcupado(false);
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
      {/* Sem `capture`: o sistema oferece câmera e galeria. */}
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
        disabled={ocupado}
        onClick={() => entrada.current?.click()}
      >
        {ocupado ? 'Salvando foto…' : 'Tirar / anexar foto'}
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
  fotos,
  onAltera,
  onApaga,
}: {
  fotos: FotoLocal[];
  onAltera: (foto: FotoLocal) => void;
  onApaga: (id: string) => void;
}) {
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const aberta = fotos.find((foto) => foto.id === abertaId);

  if (fotos.length === 0) return null;

  return (
    <>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {fotos.map((foto) => (
          <li key={foto.id}>
            <button
              type="button"
              onClick={() => setAbertaId(foto.id)}
              className="block w-full overflow-hidden rounded-lg border border-line bg-surface-raised text-left"
              aria-label={`Abrir foto: ${rotuloDaCategoriaDeFoto(foto.categoria)}${foto.legenda ? ` — ${foto.legenda}` : ''}`}
            >
              <ImagemLocal
                id={foto.id}
                legenda={foto.legenda}
                className="aspect-square"
              />
              <span className="block truncate px-1.5 py-1 text-[11px] text-zinc-300">
                {foto.legenda || rotuloDaCategoriaDeFoto(foto.categoria)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {aberta ? (
        <FotoAberta
          foto={aberta}
          onAltera={onAltera}
          onApaga={() => {
            onApaga(aberta.id);
            setAbertaId(null);
          }}
          onFechar={() => setAbertaId(null)}
        />
      ) : null}
    </>
  );
}

/** A imagem de uma foto local, a partir dos bytes do IndexedDB. */
export function ImagemLocal({
  id,
  legenda,
  className,
}: {
  id: string;
  legenda?: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [faltando, setFaltando] = useState(false);

  useEffect(() => {
    let endereco: string | null = null;
    let vivo = true;
    void leFoto(id).then((foto) => {
      if (!vivo) return;
      if (!foto) {
        setFaltando(true);
        return;
      }
      endereco = URL.createObjectURL(new Blob([foto.bytes], { type: foto.mimeType }));
      setUrl(endereco);
    });
    return () => {
      vivo = false;
      if (endereco) URL.revokeObjectURL(endereco);
    };
  }, [id]);

  if (!url) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-surface p-2 text-center text-[11px] leading-tight text-zinc-400',
          className,
        )}
      >
        {faltando ? 'Foto não encontrada neste aparelho' : 'Carregando…'}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- bytes locais via object URL
    <img
      src={url}
      alt={legenda || 'Foto de continuidade'}
      className={cn('w-full object-cover', className)}
    />
  );
}

function FotoAberta({
  foto,
  onAltera,
  onApaga,
  onFechar,
}: {
  foto: FotoLocal;
  onAltera: (foto: FotoLocal) => void;
  onApaga: () => void;
  onFechar: () => void;
}) {
  const fecha = useRef(onFechar);
  fecha.current = onFechar;

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') fecha.current();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

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
            {rotuloDaCategoriaDeFoto(foto.categoria)}
          </span>
          <IconButton label="Fechar" icon={<XIcon size={20} />} onClick={onFechar} />
        </div>
        <ImagemLocal id={foto.id} legenda={foto.legenda} className="rounded-xl" />
        <OptionChips
          label="Categoria da foto"
          size="sm"
          className="flex-wrap"
          options={FOTOS}
          value={foto.categoria || null}
          onChange={(valor) => onAltera({ ...foto, categoria: valor ?? '' })}
        />
        <TextField
          label="Legenda"
          value={foto.legenda}
          placeholder="Copo pela metade, mão direita"
          onChange={(valor) => onAltera({ ...foto, legenda: valor })}
        />
        <Button variant="danger" leftIcon={<TrashIcon size={16} />} onClick={onApaga}>
          Apagar foto
        </Button>
      </div>
    </div>
  );
}

/**
 * `id → object URL` para a folha impressa. As URLs são revogadas quando a lista muda ou a
 * folha fecha — cada uma segura a imagem inteira na memória.
 */
export function useUrlsLocais(ids: readonly string[]): Record<string, string> {
  const chave = ids.join(',');
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let vivo = true;
    const criadas: Record<string, string> = {};
    void leFotos(chave ? chave.split(',') : []).then((fotos) => {
      if (!vivo) return;
      for (const foto of fotos) {
        criadas[foto.id] = URL.createObjectURL(
          new Blob([foto.bytes], { type: foto.mimeType }),
        );
      }
      setUrls({ ...criadas });
    });
    return () => {
      vivo = false;
      for (const url of Object.values(criadas)) URL.revokeObjectURL(url);
    };
  }, [chave]);

  return urls;
}
