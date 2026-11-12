'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AppHeader } from '@/components/layout/AppHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { SaveStateBadge } from '@/components/layout/SaveStateBadge';
import { SectionCard } from '@/components/layout/SectionCard';
import { StickyActionBar } from '@/components/layout/StickyActionBar';
import { OfflineBadge } from '@/components/pwa/OfflineBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { IconButton } from '@/components/ui/IconButton';
import { OptionChips, type OptionChip } from '@/components/ui/OptionChips';
import { TextAreaField } from '@/components/ui/TextAreaField';
import { TextField } from '@/components/ui/TextField';
import { ToggleChips } from '@/components/ui/ToggleChips';
import {
  ChevronDownIcon,
  ClapperboardIcon,
  DownloadIcon,
  EyeIcon,
  FileTextIcon,
  HardDriveIcon,
  MicIcon,
  PlusIcon,
  PrinterIcon,
  TrashIcon,
  XIcon,
} from '@/components/ui/icons';
import {
  TAKE_KINDS,
  TAKE_KIND_LABEL,
  TAKE_STATUSES,
  TAKE_STATUS_LABEL,
} from '@/domain/platform/enums';
import { useBoletimLocal } from '@/hooks/useBoletimLocal';
import { tituloDoBoletim } from '@/lib/local/comum';
import {
  criaCanal,
  criaCena,
  criaPlano,
  criaRolo,
  proximoCodigoPlano,
  proximoTake,
  type BoletimSom,
  type CanalSom,
  type CenaSom,
  type PlanoSom,
  type RoloSom,
  type TakeSom,
} from '@/lib/local/som';
import { storeSom } from '@/lib/local/store';
import { cn } from '@/utils/cn';
import { formatDateBR } from '@/utils/date';
import { baixaCSV } from '@/utils/download';

import { FaixaDoDepartamento } from '@/features/diaria/FaixaDoDepartamento';
import { FolhaSom } from '@/features/sound/FolhaSom';
import { montaCSV, nomeDoArquivo } from '@/features/sound/csv';
import {
  linhasDoRelatorio,
  resumoDoDia,
  rolosDoDia,
  type RoloDoDia,
} from '@/features/sound/estrutura';
import {
  CAPTACOES,
  PROBLEMAS_DE_SOM,
  rotulosDosProblemas,
} from '@/features/sound/problemas';
import { Dobra } from '@/features/boletins-locais/Dobra';
import { ProducaoLocalSection } from '@/features/boletins-locais/ProducaoLocal';

import { fonteDoBoletimSom } from './relatorio';

const JULGAMENTOS: OptionChip[] = TAKE_STATUSES.map((status) => ({
  valor: status,
  rotulo: TAKE_STATUS_LABEL[status],
}));

const NATUREZAS: OptionChip[] = TAKE_KINDS.filter((kind) => kind !== 'SYNC').map(
  (kind) => ({
    valor: kind,
    rotulo: TAKE_KIND_LABEL[kind],
  }),
);

const PROBLEMAS: OptionChip[] = PROBLEMAS_DE_SOM.map((problema) => ({
  valor: problema.codigo,
  rotulo: problema.rotulo,
}));

const CAPTACAO: OptionChip[] = CAPTACOES.map((valor) => ({ valor, rotulo: valor }));

const SAMPLE_RATES = ['44.1 kHz', '48 kHz', '96 kHz', '192 kHz'];
const BIT_DEPTHS = ['16 bits', '24 bits', '32 bits float'];
const FRAME_RATES = ['23.976', '24', '25', '29.97', '29.97 DF', '30'];
const FORMATOS = ['WAV poly', 'WAV mono', 'BWF poly', 'BWF mono'];
const TIMECODES = [
  'Free run',
  'Rec run',
  'Jam (Tentacle)',
  'Jam (Lockit)',
  'Hora do dia',
];

/**
 * O Boletim de Som **local** (ADR-043) — sem conta, sem produção, sem diária.
 *
 * Mesmo contrato do Boletim de Câmera: tudo neste aparelho, auto-save sem botão salvar,
 * funciona em modo avião, folha A4 por impressão nativa. O take nasce preenchido (rolo,
 * arquivo incrementado e canais herdados do anterior) porque o mixer preenche com uma mão,
 * durante a gravação.
 */
export function BoletimSomEditor({ id }: { id: string | null }) {
  const router = useRouter();
  const { boletim, status, saveState, update } = useBoletimLocal(storeSom, id);
  const [folha, setFolha] = useState(false);
  const [apagando, setApagando] = useState(false);

  const leitura = useMemo(() => {
    if (!boletim) return null;
    const fonte = fonteDoBoletimSom(boletim);
    const linhas = linhasDoRelatorio(fonte.fonte);
    return { ...fonte, linhas, rolos: rolosDoDia(linhas, fonte.rolls) };
  }, [boletim]);

  useEffect(() => {
    if (!folha) return;
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setFolha(false);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [folha]);

  if (status === 'loading')
    return <Estado titulo="Carregando…" texto="Abrindo boletim." />;
  if (status === 'not-found' || !boletim || !leitura) {
    return (
      <Estado
        titulo="Boletim não encontrado"
        texto="Este boletim não existe neste aparelho. Volte e escolha outro."
      />
    );
  }

  const resumo = resumoDoDia(leitura.linhas);
  const contexto = { projeto: tituloDoBoletim(boletim), data: boletim.producao.data };

  // ---- mutações ----
  const altera = (patch: Partial<BoletimSom>) =>
    update((prev) => ({ ...prev, ...patch }));

  const alteraCena = (cenaId: string, muda: (cena: CenaSom) => CenaSom) =>
    update((prev) => ({
      ...prev,
      cenas: prev.cenas.map((cena) => (cena.id === cenaId ? muda(cena) : cena)),
    }));

  const alteraPlano = (
    cenaId: string,
    planoId: string,
    muda: (p: PlanoSom) => PlanoSom,
  ) =>
    alteraCena(cenaId, (cena) => ({
      ...cena,
      planos: cena.planos.map((plano) => (plano.id === planoId ? muda(plano) : plano)),
    }));

  const alteraTake = (
    cenaId: string,
    planoId: string,
    takeId: string,
    muda: (take: TakeSom) => TakeSom,
  ) =>
    alteraPlano(cenaId, planoId, (plano) => ({
      ...plano,
      takes: plano.takes.map((take) => (take.id === takeId ? muda(take) : take)),
    }));

  const novoTake = (cenaId: string, planoId: string) =>
    update((prev) => {
      const cena = prev.cenas.find((item) => item.id === cenaId);
      const plano = cena?.planos.find((item) => item.id === planoId);
      if (!cena || !plano) return prev;
      const take = proximoTake(prev, plano);
      return {
        ...prev,
        cenas: prev.cenas.map((c) =>
          c.id !== cenaId
            ? c
            : {
                ...c,
                planos: c.planos.map((p) =>
                  p.id === planoId ? { ...p, takes: [...p.takes, take] } : p,
                ),
              },
        ),
      };
    });

  /** Plano novo já nasce com o take 1 — é para começar a marcar, não para preencher forms. */
  const novoPlano = (cenaId: string) =>
    update((prev) => {
      const cena = prev.cenas.find((item) => item.id === cenaId);
      if (!cena) return prev;
      const plano = criaPlano(proximoCodigoPlano(cena));
      plano.takes = [proximoTake(prev, plano)];
      return {
        ...prev,
        cenas: prev.cenas.map((c) =>
          c.id === cenaId ? { ...c, planos: [...c.planos, plano] } : c,
        ),
      };
    });

  const novaCena = () =>
    update((prev) => {
      const cena = criaCena('');
      const plano = criaPlano('1');
      plano.takes = [proximoTake(prev, plano)];
      cena.planos = [plano];
      return { ...prev, cenas: [...prev.cenas, cena] };
    });

  const titulo =
    tituloDoBoletim(boletim) === 'Sem título'
      ? 'Boletim de Som'
      : tituloDoBoletim(boletim);

  return (
    <div className={cn('flex min-h-dvh flex-col bg-ink', folha && 'no-print')}>
      <AppHeader
        title={titulo}
        subtitle={[
          'Som',
          formatDateBR(boletim.producao.data),
          boletim.producao.diaria && `Diária ${boletim.producao.diaria}`,
        ]
          .filter(Boolean)
          .join(' · ')}
        backHref="/"
        right={
          <>
            <OfflineBadge />
            <SaveStateBadge state={saveState} />
          </>
        }
      />
      <FaixaDoDepartamento modulo="som" />

      <main className="flex-1 py-4">
        <PageContainer className="flex flex-col gap-4">
          <ProducaoLocalSection
            value={boletim.producao}
            onChange={(patch) => altera({ producao: { ...boletim.producao, ...patch } })}
          />

          <SectionCard
            title="Equipe e técnica"
            icon={<MicIcon size={18} />}
            collapsible
            defaultOpen={false}
            summary={
              [
                boletim.equipe.mixer,
                boletim.tecnica.gravador,
                boletim.tecnica.sampleRate,
                boletim.tecnica.bitDepth,
              ]
                .filter(Boolean)
                .join(' · ') || 'Não preenchida'
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField
                label="Técnico de som / Sound mixer"
                value={boletim.equipe.mixer}
                onChange={(v) => altera({ equipe: { ...boletim.equipe, mixer: v } })}
              />
              <TextField
                label="Microfonista / Boom"
                value={boletim.equipe.boom}
                onChange={(v) => altera({ equipe: { ...boletim.equipe, boom: v } })}
              />
              <TextField
                label="Gravador"
                className="sm:col-span-2"
                value={boletim.tecnica.gravador}
                placeholder="Sound Devices 833"
                onChange={(v) => altera({ tecnica: { ...boletim.tecnica, gravador: v } })}
              />
              <TextField
                label="Sample rate"
                value={boletim.tecnica.sampleRate}
                options={SAMPLE_RATES}
                onChange={(v) =>
                  altera({ tecnica: { ...boletim.tecnica, sampleRate: v } })
                }
              />
              <TextField
                label="Bit depth"
                value={boletim.tecnica.bitDepth}
                options={BIT_DEPTHS}
                onChange={(v) => altera({ tecnica: { ...boletim.tecnica, bitDepth: v } })}
              />
              <TextField
                label="Frame rate"
                value={boletim.tecnica.frameRate}
                options={FRAME_RATES}
                onChange={(v) =>
                  altera({ tecnica: { ...boletim.tecnica, frameRate: v } })
                }
              />
              <TextField
                label="Timecode"
                value={boletim.tecnica.timecode}
                options={TIMECODES}
                onChange={(v) => altera({ tecnica: { ...boletim.tecnica, timecode: v } })}
              />
              <TextField
                label="Formato"
                className="sm:col-span-2"
                value={boletim.tecnica.formato}
                options={FORMATOS}
                onChange={(v) => altera({ tecnica: { ...boletim.tecnica, formato: v } })}
              />
            </div>
          </SectionCard>

          <RolosSection
            rolos={boletim.rolos}
            doDia={leitura.rolos}
            onChange={(rolos) => altera({ rolos })}
          />

          <SectionCard
            title="Cenas"
            icon={<ClapperboardIcon size={18} />}
            action={
              <Button
                size="sm"
                variant="primary"
                leftIcon={<PlusIcon size={15} />}
                onClick={novaCena}
              >
                Cena
              </Button>
            }
          >
            {boletim.cenas.length === 0 ? (
              <p className="text-sm text-zinc-400">
                Nenhuma cena ainda. Toque em{' '}
                <strong className="text-zinc-200">+ Cena</strong> e comece a marcar: o
                take 1 já nasce pronto.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {boletim.cenas.map((cena) => (
                  <CenaCard
                    key={cena.id}
                    cena={cena}
                    onNumero={(numero) => alteraCena(cena.id, (c) => ({ ...c, numero }))}
                    onRemove={() =>
                      update((prev) => ({
                        ...prev,
                        cenas: prev.cenas.filter((c) => c.id !== cena.id),
                      }))
                    }
                    onNovoPlano={() => novoPlano(cena.id)}
                    onPlano={(planoId, muda) => alteraPlano(cena.id, planoId, muda)}
                    onRemovePlano={(planoId) =>
                      alteraCena(cena.id, (c) => ({
                        ...c,
                        planos: c.planos.filter((p) => p.id !== planoId),
                      }))
                    }
                    onNovoTake={(planoId) => novoTake(cena.id, planoId)}
                    onTake={(planoId, takeId, muda) =>
                      alteraTake(cena.id, planoId, takeId, muda)
                    }
                  />
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Observações gerais" icon={<FileTextIcon size={18} />}>
            <TextAreaField
              label="Observações gerais do som"
              value={boletim.observacoesGerais}
              rows={4}
              placeholder="Gerador próximo à locação; obra na rua das 14h às 16h"
              onChange={(v) => altera({ observacoesGerais: v })}
            />
          </SectionCard>

          <SectionCard title="Som do dia" icon={<FileTextIcon size={18} />}>
            <dl className="grid grid-cols-3 gap-3 text-sm sm:grid-cols-6">
              <Numero rotulo="Takes" valor={resumo.takes} />
              <Numero rotulo="Circled" valor={resumo.circled} />
              <Numero rotulo="MOS" valor={resumo.mos} />
              <Numero rotulo="NG" valor={resumo.ng} />
              <Numero rotulo="Problemas" valor={resumo.comProblema} />
              <Numero rotulo="Rolos" valor={leitura.rolos.length} />
            </dl>
          </SectionCard>

          <Button
            variant="secondary"
            fullWidth
            leftIcon={<DownloadIcon size={18} />}
            disabled={leitura.linhas.length === 0}
            onClick={() =>
              baixaCSV(montaCSV(leitura.linhas, contexto), nomeDoArquivo(contexto))
            }
          >
            Baixar CSV para a pós
          </Button>
        </PageContainer>
      </main>

      <StickyActionBar>
        <Button
          variant="ghost"
          leftIcon={<TrashIcon size={18} />}
          onClick={() => setApagando(true)}
        >
          Excluir
        </Button>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          leftIcon={<EyeIcon size={20} />}
          onClick={() => setFolha(true)}
        >
          Visualizar / PDF
        </Button>
      </StickyActionBar>

      {folha ? (
        <div className="print-overlay fixed inset-0 z-40 overflow-y-auto bg-ink/95 px-3 py-4 backdrop-blur-sm">
          <div className="no-print mx-auto mb-3 flex w-full max-w-[820px] items-center gap-2">
            <Button
              variant="secondary"
              leftIcon={<XIcon size={16} />}
              onClick={() => setFolha(false)}
            >
              Fechar
            </Button>
            <span className="flex-1" />
            <Button
              variant="primary"
              leftIcon={<PrinterIcon size={18} />}
              onClick={() => window.print()}
            >
              Imprimir / PDF
            </Button>
          </div>
          <FolhaSom
            cabecalho={leitura.cabecalho}
            config={leitura.config}
            linhas={leitura.linhas}
            rolos={leitura.rolos}
          />
        </div>
      ) : null}

      <ConfirmDialog
        open={apagando}
        title="Excluir boletim de som?"
        description={`"${tituloDoBoletim(boletim)}" será removido deste aparelho. Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        destructive
        onConfirm={() => {
          storeSom.remove(boletim.id);
          router.replace('/');
        }}
        onCancel={() => setApagando(false)}
      />
    </div>
  );
}

function Estado({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      <AppHeader title={titulo} backHref="/" />
      <PageContainer className="flex flex-1 flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-zinc-400">{texto}</p>
      </PageContainer>
    </div>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-400">{rotulo}</dt>
      <dd className="text-lg font-semibold text-zinc-100">{valor}</dd>
    </div>
  );
}

// ---- Rolos ----

function RolosSection({
  rolos,
  doDia,
  onChange,
}: {
  rolos: RoloSom[];
  doDia: RoloDoDia[];
  onChange: (rolos: RoloSom[]) => void;
}) {
  const arquivosDe = (rotulo: string) =>
    doDia.find((item) => item.rotulo.trim().toUpperCase() === rotulo.trim().toUpperCase())
      ?.arquivos ?? [];
  // Rolos citados nos takes e ainda não cadastrados aparecem para um toque de cadastro.
  const soNosTakes = doDia.filter((item) => item.id === null);

  return (
    <SectionCard
      title="Rolos e cartões"
      icon={<HardDriveIcon size={18} />}
      collapsible
      defaultOpen={false}
      summary={
        doDia.length > 0
          ? doDia.map((rolo) => `${rolo.rotulo} (${rolo.arquivos.length})`).join(' · ')
          : 'Nenhum ainda'
      }
    >
      <div className="flex flex-col gap-3">
        {rolos.map((rolo) => {
          const arquivos = arquivosDe(rolo.rotulo);
          const muda = (patch: Partial<RoloSom>) =>
            onChange(
              rolos.map((item) => (item.id === rolo.id ? { ...item, ...patch } : item)),
            );
          return (
            <div
              key={rolo.id}
              className="flex flex-col gap-3 rounded-xl border border-line bg-surface-raised p-3"
            >
              <div className="flex items-end gap-2">
                <TextField
                  label="Rolo / cartão"
                  className="flex-1"
                  value={rolo.rotulo}
                  placeholder="004"
                  onChange={(v) => muda({ rotulo: v })}
                />
                <IconButton
                  label={`Remover rolo ${rolo.rotulo}`}
                  variant="danger"
                  icon={<TrashIcon size={16} />}
                  onClick={() => onChange(rolos.filter((item) => item.id !== rolo.id))}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField
                  label="Mídia"
                  value={rolo.midia}
                  placeholder="SD #2 · 128 GB"
                  onChange={(v) => muda({ midia: v })}
                />
                <TextField
                  label="Equipamento"
                  value={rolo.equipamento}
                  placeholder="Sound Devices 833"
                  onChange={(v) => muda({ equipamento: v })}
                />
              </div>
              <TextField
                label="Observações"
                value={rolo.observacoes}
                onChange={(v) => muda({ observacoes: v })}
              />
              <p className="text-xs text-zinc-400">
                {arquivos.length === 0
                  ? 'Nenhum arquivo neste rolo ainda.'
                  : `${arquivos.length} arquivo(s): ${arquivos
                      .map((linha) => linha.arquivo || `take ${linha.take}`)
                      .join(', ')}`}
              </p>
            </div>
          );
        })}

        {soNosTakes.map((rolo) => (
          <div
            key={rolo.rotulo}
            className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2 text-sm text-zinc-300"
          >
            <span className="flex-1">
              Rolo <span className="font-mono">{rolo.rotulo}</span> ·{' '}
              {rolo.arquivos.length} arquivo(s), sem cadastro
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange([...rolos, criaRolo(rolo.rotulo)])}
            >
              Cadastrar
            </Button>
          </div>
        ))}

        <Button
          variant="secondary"
          leftIcon={<PlusIcon size={16} />}
          onClick={() => onChange([...rolos, criaRolo('')])}
        >
          Novo rolo / cartão
        </Button>
      </div>
    </SectionCard>
  );
}

// ---- Cena / plano / take ----

function CenaCard({
  cena,
  onNumero,
  onRemove,
  onNovoPlano,
  onPlano,
  onRemovePlano,
  onNovoTake,
  onTake,
}: {
  cena: CenaSom;
  onNumero: (numero: string) => void;
  onRemove: () => void;
  onNovoPlano: () => void;
  onPlano: (planoId: string, muda: (p: PlanoSom) => PlanoSom) => void;
  onRemovePlano: (planoId: string) => void;
  onNovoTake: (planoId: string) => void;
  onTake: (planoId: string, takeId: string, muda: (t: TakeSom) => TakeSom) => void;
}) {
  const [aberto, setAberto] = useState(true);
  const takes = cena.planos.reduce((soma, plano) => soma + plano.takes.length, 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface-raised">
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2',
          aberto && 'border-b border-line',
        )}
      >
        <button
          type="button"
          aria-expanded={aberto}
          aria-label={aberto ? 'Recolher cena' : 'Expandir cena'}
          onClick={() => setAberto((valor) => !valor)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center text-zinc-400"
        >
          <ChevronDownIcon
            size={20}
            className={cn('transition', aberto && 'rotate-180')}
          />
        </button>
        <TextField
          label="Cena"
          clearable={false}
          className="w-28"
          value={cena.numero}
          placeholder="24A"
          autoCapitalize="characters"
          onChange={onNumero}
        />
        <span className="flex-1 pt-5 text-right text-xs text-zinc-400">
          {takes} take(s)
        </span>
        <IconButton
          label={`Remover cena ${cena.numero}`}
          variant="danger"
          className="mt-5"
          icon={<TrashIcon size={16} />}
          onClick={onRemove}
        />
      </div>

      {aberto ? (
        <div className="flex flex-col gap-3 p-3">
          {cena.planos.map((plano) => (
            <PlanoCard
              key={plano.id}
              plano={plano}
              onChange={(muda) => onPlano(plano.id, muda)}
              onRemove={() => onRemovePlano(plano.id)}
              onNovoTake={() => onNovoTake(plano.id)}
              onTake={(takeId, muda) => onTake(plano.id, takeId, muda)}
            />
          ))}
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<PlusIcon size={15} />}
            onClick={onNovoPlano}
          >
            Novo plano
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function PlanoCard({
  plano,
  onChange,
  onRemove,
  onNovoTake,
  onTake,
}: {
  plano: PlanoSom;
  onChange: (muda: (p: PlanoSom) => PlanoSom) => void;
  onRemove: () => void;
  onNovoTake: () => void;
  onTake: (takeId: string, muda: (t: TakeSom) => TakeSom) => void;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
      <div className="flex items-end gap-2">
        <TextField
          label="Plano"
          clearable={false}
          className="w-20"
          value={plano.codigo}
          onChange={(codigo) => onChange((p) => ({ ...p, codigo }))}
        />
        <TextField
          label="Descrição"
          className="flex-1"
          value={plano.descricao}
          placeholder="Plano geral da sala"
          onChange={(descricao) => onChange((p) => ({ ...p, descricao }))}
        />
        <IconButton
          label={`Remover plano ${plano.codigo}`}
          variant="danger"
          icon={<TrashIcon size={16} />}
          onClick={onRemove}
        />
      </div>

      {plano.takes.map((take) => (
        <TakeCard
          key={take.id}
          take={take}
          onChange={(muda) => onTake(take.id, muda)}
          onRemove={() =>
            onChange((p) => ({ ...p, takes: p.takes.filter((t) => t.id !== take.id) }))
          }
        />
      ))}

      <Button variant="secondary" leftIcon={<PlusIcon size={16} />} onClick={onNovoTake}>
        Próximo take
      </Button>
    </section>
  );
}

function TakeCard({
  take,
  onChange,
  onRemove,
}: {
  take: TakeSom;
  onChange: (muda: (t: TakeSom) => TakeSom) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<TakeSom>) => onChange((t) => ({ ...t, ...patch }));
  const circled = take.julgamento === 'CIRCLE';
  const mos = take.natureza === 'MOS';
  const problemas = rotulosDosProblemas(take.problemas.join(','));

  const setCanal = (canalId: string, patch: Partial<CanalSom>) =>
    onChange((t) => ({
      ...t,
      canais: t.canais.map((canal) =>
        canal.id === canalId ? { ...canal, ...patch } : canal,
      ),
    }));

  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition',
        circled ? 'border-approved/50 bg-approved-soft' : 'border-line bg-surface-raised',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-zinc-100">Take</span>
        <TextField
          label="Nº do take"
          clearable={false}
          className="w-20 [&_label]:sr-only"
          value={take.numero}
          inputMode="numeric"
          onChange={(numero) => set({ numero })}
        />
        {mos ? <Badge tone="warning">MOS</Badge> : null}
        {problemas.length > 0 || take.obsProblemas ? (
          <Badge tone="warning">problema</Badge>
        ) : null}
        <span className="flex-1" />
        <IconButton
          label={`Remover take ${take.numero}`}
          variant="danger"
          icon={<TrashIcon size={16} />}
          onClick={onRemove}
        />
      </div>

      <OptionChips
        label="Julgamento do som"
        className="mt-3 flex-wrap"
        options={JULGAMENTOS}
        value={take.julgamento || null}
        onChange={(valor) => set({ julgamento: valor ?? '' })}
      />

      {take.julgamento === 'NG' ? (
        <TextField
          label="Motivo do NG"
          className="mt-3"
          value={take.motivoNG}
          placeholder="Avião"
          onChange={(motivoNG) => set({ motivoNG })}
        />
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <TextField
          label="Rolo"
          clearable={false}
          value={take.rolo}
          placeholder="004"
          onChange={(rolo) => set({ rolo })}
        />
        <TextField
          label="Arquivo"
          clearable={false}
          value={take.arquivo}
          placeholder="004_012"
          onChange={(arquivo) => set({ arquivo })}
        />
      </div>

      <Dobra
        titulo="Natureza"
        resumo={
          take.natureza
            ? (TAKE_KIND_LABEL[take.natureza as keyof typeof TAKE_KIND_LABEL] ??
              take.natureza)
            : ''
        }
        destaque={mos}
      >
        <OptionChips
          label="Natureza do take"
          size="sm"
          className="flex-wrap"
          options={NATUREZAS}
          value={take.natureza || null}
          onChange={(valor) => set({ natureza: valor ?? '' })}
        />
      </Dobra>

      <Dobra
        titulo="Timecode e duração"
        resumo={[take.tcInicio, take.tcFim].filter(Boolean).join(' → ') || take.duracao}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <TextField
            label="TC início"
            clearable={false}
            value={take.tcInicio}
            placeholder="14:32:10:12"
            inputMode="numeric"
            onChange={(tcInicio) => set({ tcInicio })}
          />
          <TextField
            label="TC fim"
            clearable={false}
            value={take.tcFim}
            placeholder="14:33:02:04"
            inputMode="numeric"
            onChange={(tcFim) => set({ tcFim })}
          />
          <TextField
            label="Duração"
            clearable={false}
            value={take.duracao}
            placeholder="00:52"
            inputMode="numeric"
            onChange={(duracao) => set({ duracao })}
          />
        </div>
      </Dobra>

      <Dobra
        titulo="Canais"
        resumo={take.canais
          .map((canal) =>
            [canal.indice, canal.nome || canal.microfone].filter(Boolean).join(' '),
          )
          .join(' · ')}
      >
        <div className="flex flex-col gap-2">
          {take.canais.length === 0 ? (
            <p className="text-xs text-zinc-400">
              Nenhum canal ainda. O que você cadastrar aqui é herdado pelos próximos
              takes.
            </p>
          ) : null}
          {take.canais.map((canal) => (
            <div
              key={canal.id}
              className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-2"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-brand">
                  Canal {canal.indice}
                </span>
                <span className="flex-1" />
                <IconButton
                  label={`Remover canal ${canal.indice}`}
                  variant="danger"
                  icon={<TrashIcon size={16} />}
                  onClick={() =>
                    onChange((t) => ({
                      ...t,
                      canais: t.canais.filter((item) => item.id !== canal.id),
                    }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <TextField
                  label="Identificação"
                  value={canal.nome}
                  placeholder="João"
                  onChange={(nome) => setCanal(canal.id, { nome })}
                />
                <TextField
                  label="Microfone"
                  value={canal.microfone}
                  placeholder="MKH 416"
                  onChange={(microfone) => setCanal(canal.id, { microfone })}
                />
              </div>
              <OptionChips
                label={`Captação do canal ${canal.indice}`}
                size="sm"
                className="flex-wrap"
                options={CAPTACAO}
                value={canal.captacao || null}
                onChange={(valor) => setCanal(canal.id, { captacao: valor ?? '' })}
              />
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<PlusIcon size={15} />}
            onClick={() =>
              onChange((t) => ({
                ...t,
                canais: [
                  ...t.canais,
                  criaCanal(
                    t.canais.reduce(
                      (maior, c) => Math.max(maior, Number(c.indice) || 0),
                      0,
                    ) + 1,
                  ),
                ],
              }))
            }
          >
            Adicionar canal
          </Button>
        </div>
      </Dobra>

      <Dobra
        titulo="Problemas"
        resumo={[...problemas, take.obsProblemas ? 'obs.' : '']
          .filter(Boolean)
          .join(' · ')}
        destaque={problemas.length > 0 || Boolean(take.obsProblemas)}
      >
        <ToggleChips
          label="Problemas de captação"
          options={PROBLEMAS}
          values={take.problemas}
          onToggle={(codigo) =>
            set({
              problemas: take.problemas.includes(codigo)
                ? take.problemas.filter((item) => item !== codigo)
                : [...take.problemas, codigo],
            })
          }
        />
        <TextField
          label="Outros problemas / detalhes"
          className="mt-3"
          value={take.obsProblemas}
          placeholder="Avião aos 20 s; lapela do João raspando no fim"
          onChange={(obsProblemas) => set({ obsProblemas })}
        />
      </Dobra>

      <TextField
        label="Observações técnicas"
        className="mt-3"
        value={take.observacoes}
        placeholder="Ganho do boom +3 dB a partir daqui"
        onChange={(observacoes) => set({ observacoes })}
      />
    </div>
  );
}
