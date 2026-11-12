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
import {
  ChevronDownIcon,
  ClapperboardIcon,
  EyeIcon,
  FileTextIcon,
  PlusIcon,
  PrinterIcon,
  TrashIcon,
  XIcon,
} from '@/components/ui/icons';
import { useBoletimLocal } from '@/hooks/useBoletimLocal';
import { tituloDoBoletim } from '@/lib/local/comum';
import {
  criaCenaContinuidade,
  criaPlanoContinuidade,
  idsDasFotos,
  proximoTakeContinuidade,
  type BoletimContinuidade,
  type CampoAcaoLocal,
  type CenaContinuidade,
  type PlanoContinuidade,
  type TakeContinuidade,
} from '@/lib/local/continuidade';
import { apagaFotosDoBoletim } from '@/lib/local/fotos';
import { storeContinuidade } from '@/lib/local/store';
import { proximoCodigoPlano } from '@/lib/local/som';
import { cn } from '@/utils/cn';
import { formatDateBR } from '@/utils/date';

import { FaixaDoDepartamento } from '@/features/diaria/FaixaDoDepartamento';
import { FolhaContinuidade } from '@/features/continuity/FolhaContinuidade';
import { CAMPOS_DE_ACAO, VEREDITOS } from '@/features/continuity/estrutura';
import { Dobra } from '@/features/boletins-locais/Dobra';
import { NotasEFotos, useUrlsLocais } from '@/features/boletins-locais/NotasEFotos';
import { ProducaoLocalSection } from '@/features/boletins-locais/ProducaoLocal';

import { leituraDoBoletimContinuidade } from './relatorio';

const VEREDITO: OptionChip[] = VEREDITOS.map((item) => ({
  valor: item.valor,
  rotulo: item.rotulo,
}));

const INT_EXT: OptionChip[] = [
  { valor: 'INT', rotulo: 'Int.' },
  { valor: 'EXT', rotulo: 'Ext.' },
  { valor: 'INT_EXT', rotulo: 'Int./Ext.' },
];

const DIA_NOITE: OptionChip[] = [
  { valor: 'DAY', rotulo: 'Dia' },
  { valor: 'NIGHT', rotulo: 'Noite' },
  { valor: 'DAWN', rotulo: 'Amanhecer' },
  { valor: 'DUSK', rotulo: 'Entardecer' },
];

/**
 * O Boletim de Continuidade **local** (ADR-043) — sem conta, sem produção, sem diária.
 *
 * O registro detalhado do material filmado, para direção, produção e montagem: cena,
 * plano e take com veredito, duração, ação e o problema de continuidade; notas de raccord
 * e fotos em qualquer nível. O cartão do take mostra o essencial — veredito, duração,
 * observação, problema — e esconde o resto atrás de dobras, porque um formulário de
 * sessenta campos aberto por take é a forma mais rápida de fazer alguém voltar ao caderno.
 */
export function BoletimContinuidadeEditor({
  id,
  abrirFolha = false,
}: {
  id: string | null;
  /** `?folha=1`: abre direto na folha — o "Ver PDF" da lista, como o de Câmera. */
  abrirFolha?: boolean;
}) {
  const router = useRouter();
  const { boletim, status, saveState, update } = useBoletimLocal(storeContinuidade, id);
  const [folha, setFolha] = useState(abrirFolha);
  const [apagando, setApagando] = useState(false);

  const leitura = useMemo(
    () => (boletim ? leituraDoBoletimContinuidade(boletim) : null),
    [boletim],
  );
  const idsParaFolha = useMemo(
    () => (folha && boletim ? idsDasFotos(boletim) : []),
    [folha, boletim],
  );
  const urls = useUrlsLocais(idsParaFolha);

  // Fechar a folha aberta por "Ver PDF" tira o `?folha=1` da URL: senão recarregar a
  // página a abriria de novo.
  useEffect(() => {
    if (folha) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('folha')) return;
    url.searchParams.delete('folha');
    window.history.replaceState(null, '', url.toString());
  }, [folha]);

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

  const altera = (patch: Partial<BoletimContinuidade>) =>
    update((prev) => ({ ...prev, ...patch }));

  const alteraCena = (cenaId: string, muda: (c: CenaContinuidade) => CenaContinuidade) =>
    update((prev) => ({
      ...prev,
      cenas: prev.cenas.map((cena) => (cena.id === cenaId ? muda(cena) : cena)),
    }));

  const novaCena = () =>
    update((prev) => {
      const cena = criaCenaContinuidade('');
      const plano = criaPlanoContinuidade('1');
      plano.takes = [proximoTakeContinuidade(plano)];
      cena.planos = [plano];
      return { ...prev, cenas: [...prev.cenas, cena] };
    });

  const titulo =
    tituloDoBoletim(boletim) === 'Sem título'
      ? 'Boletim de Continuidade'
      : tituloDoBoletim(boletim);

  const contagens = leitura.contagens;

  return (
    <div className={cn('flex min-h-dvh flex-col bg-ink', folha && 'no-print')}>
      <AppHeader
        title={titulo}
        subtitle={[
          'Continuidade',
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
      <FaixaDoDepartamento modulo="continuidade" />

      <main className="flex-1 py-4">
        <PageContainer className="flex flex-col gap-4">
          <ProducaoLocalSection
            value={boletim.producao}
            onChange={(patch) => altera({ producao: { ...boletim.producao, ...patch } })}
          >
            <TextField
              label="Continuísta"
              className="sm:col-span-2"
              value={boletim.continuista}
              onChange={(continuista) => altera({ continuista })}
            />
          </ProducaoLocalSection>

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
                <strong className="text-zinc-200">+ Cena</strong> e comece a registrar: o
                plano 1 e o take 1 já nascem prontos.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {boletim.cenas.map((cena) => (
                  <CenaCard
                    key={cena.id}
                    boletimId={boletim.id}
                    cena={cena}
                    onChange={(muda) => alteraCena(cena.id, muda)}
                    onRemove={() =>
                      update((prev) => ({
                        ...prev,
                        cenas: prev.cenas.filter((c) => c.id !== cena.id),
                      }))
                    }
                  />
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Observações gerais e pendências"
            icon={<FileTextIcon size={18} />}
          >
            <TextAreaField
              label="Observações gerais"
              value={boletim.observacoesGerais}
              rows={4}
              placeholder="Cena 31 ficou para amanhã; figurino da Maria precisa de reposição"
              onChange={(observacoesGerais) => altera({ observacoesGerais })}
            />
          </SectionCard>

          <SectionCard title="Continuidade do dia" icon={<FileTextIcon size={18} />}>
            <dl className="grid grid-cols-3 gap-3 text-sm sm:grid-cols-6">
              <Numero rotulo="Cenas" valor={contagens.cenas} />
              <Numero rotulo="Planos" valor={contagens.planos} />
              <Numero rotulo="Takes" valor={contagens.takes} />
              <Numero rotulo="Prints" valor={contagens.prints} />
              <Numero rotulo="Problemas" valor={contagens.comProblema} />
              <Numero rotulo="Minutagem" valor={contagens.duracao || '—'} />
            </dl>
          </SectionCard>
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
          <FolhaContinuidade
            documento="CONTINUIDADE"
            cabecalho={leitura.cabecalho}
            linhas={leitura.linhas}
            contagens={leitura.contagens}
            raccord={leitura.raccord}
            urlsDasFotos={urls}
          />
        </div>
      ) : null}

      <ConfirmDialog
        open={apagando}
        title="Excluir boletim de continuidade?"
        description={`"${tituloDoBoletim(boletim)}" e as fotos dele serão removidos deste aparelho. Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        destructive
        onConfirm={() => {
          storeContinuidade.remove(boletim.id);
          void apagaFotosDoBoletim(boletim.id).catch(() => undefined);
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

function Numero({ rotulo, valor }: { rotulo: string; valor: number | string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-400">{rotulo}</dt>
      <dd className="text-lg font-semibold text-zinc-100">{valor}</dd>
    </div>
  );
}

// ---- Cena ----

function CenaCard({
  boletimId,
  cena,
  onChange,
  onRemove,
}: {
  boletimId: string;
  cena: CenaContinuidade;
  onChange: (muda: (c: CenaContinuidade) => CenaContinuidade) => void;
  onRemove: () => void;
}) {
  const [aberto, setAberto] = useState(true);
  const set = (patch: Partial<CenaContinuidade>) => onChange((c) => ({ ...c, ...patch }));
  const takes = cena.planos.reduce((soma, plano) => soma + plano.takes.length, 0);
  const prints = cena.planos.reduce(
    (soma, plano) => soma + plano.takes.filter((t) => t.veredito === 'CIRCLE').length,
    0,
  );

  const alteraPlano = (
    planoId: string,
    muda: (p: PlanoContinuidade) => PlanoContinuidade,
  ) =>
    onChange((c) => ({
      ...c,
      planos: c.planos.map((plano) => (plano.id === planoId ? muda(plano) : plano)),
    }));

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
          onChange={(numero) => set({ numero })}
        />
        <span className="flex flex-1 flex-wrap items-center justify-end gap-2 pt-5 text-xs text-zinc-400">
          {prints > 0 ? <Badge tone="approved">{prints} print</Badge> : null}
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
          <Dobra
            titulo="Dados da cena"
            resumo={[cena.pagina, cena.diaHistoria, cena.locacao]
              .filter(Boolean)
              .join(' · ')}
          >
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Página"
                clearable={false}
                value={cena.pagina}
                placeholder="2 4/8"
                onChange={(pagina) => set({ pagina })}
              />
              <TextField
                label="Dia da história"
                value={cena.diaHistoria}
                placeholder="Dia 3"
                onChange={(diaHistoria) => set({ diaHistoria })}
              />
            </div>
            <OptionChips
              label="Interna ou externa"
              size="sm"
              className="mt-3 flex-wrap"
              options={INT_EXT}
              value={cena.intExt || null}
              onChange={(valor) => set({ intExt: valor ?? '' })}
            />
            <OptionChips
              label="Dia ou noite"
              size="sm"
              className="mt-2 flex-wrap"
              options={DIA_NOITE}
              value={cena.diaNoite || null}
              onChange={(valor) => set({ diaNoite: valor ?? '' })}
            />
            <TextField
              label="Locação"
              className="mt-3"
              value={cena.locacao}
              onChange={(locacao) => set({ locacao })}
            />
            <TextAreaField
              label="Descrição"
              className="mt-3"
              rows={2}
              value={cena.descricao}
              placeholder="João chega em casa e encontra a porta aberta"
              onChange={(descricao) => set({ descricao })}
            />
          </Dobra>

          <NotasEFotos
            boletimId={boletimId}
            rotulo="Raccord e fotos da cena"
            notas={cena.notas}
            fotos={cena.fotos}
            onNotas={(notas) => set({ notas })}
            onFotos={(fotos) => set({ fotos })}
          />

          {cena.planos.map((plano) => (
            <PlanoCard
              key={plano.id}
              boletimId={boletimId}
              plano={plano}
              onChange={(muda) => alteraPlano(plano.id, muda)}
              onRemove={() =>
                onChange((c) => ({
                  ...c,
                  planos: c.planos.filter((p) => p.id !== plano.id),
                }))
              }
            />
          ))}

          <Button
            variant="ghost"
            size="sm"
            leftIcon={<PlusIcon size={15} />}
            onClick={() =>
              onChange((c) => {
                const plano = criaPlanoContinuidade(proximoCodigoPlano(c));
                plano.takes = [proximoTakeContinuidade(plano)];
                return { ...c, planos: [...c.planos, plano] };
              })
            }
          >
            Novo plano
          </Button>
        </div>
      ) : null}
    </section>
  );
}

// ---- Plano ----

function PlanoCard({
  boletimId,
  plano,
  onChange,
  onRemove,
}: {
  boletimId: string;
  plano: PlanoContinuidade;
  onChange: (muda: (p: PlanoContinuidade) => PlanoContinuidade) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<PlanoContinuidade>) =>
    onChange((p) => ({ ...p, ...patch }));
  const enquadramento = [plano.tamanho, plano.angulo, plano.movimento]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
      <div className="flex items-end gap-2">
        <TextField
          label="Plano"
          clearable={false}
          className="w-20"
          value={plano.codigo}
          onChange={(codigo) => set({ codigo })}
        />
        <span className="flex-1 truncate pb-3 text-xs text-zinc-400">
          {enquadramento}
        </span>
        <IconButton
          label={`Remover plano ${plano.codigo}`}
          variant="danger"
          icon={<TrashIcon size={16} />}
          onClick={onRemove}
        />
      </div>

      <Dobra titulo="Enquadramento" resumo={enquadramento || plano.descricao}>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Tamanho"
            value={plano.tamanho}
            placeholder="Close"
            onChange={(tamanho) => set({ tamanho })}
          />
          <TextField
            label="Ângulo"
            value={plano.angulo}
            placeholder="Contra-plongée"
            onChange={(angulo) => set({ angulo })}
          />
          <TextField
            label="Movimento"
            value={plano.movimento}
            placeholder="Travelling lateral"
            onChange={(movimento) => set({ movimento })}
          />
          <TextField
            label="Eyeline"
            value={plano.eyeline}
            placeholder="Olha à direita da câmera"
            onChange={(eyeline) => set({ eyeline })}
          />
        </div>
        <TextAreaField
          label="Descrição do enquadramento"
          className="mt-3"
          rows={2}
          value={plano.descricao}
          placeholder="Plano médio de João no sofá; janela ao fundo à esquerda"
          onChange={(descricao) => set({ descricao })}
        />
      </Dobra>

      <NotasEFotos
        boletimId={boletimId}
        rotulo="Raccord e fotos do plano"
        notas={plano.notas}
        fotos={plano.fotos}
        onNotas={(notas) => set({ notas })}
        onFotos={(fotos) => set({ fotos })}
      />

      {plano.takes.map((take) => (
        <TakeCard
          key={take.id}
          boletimId={boletimId}
          take={take}
          onChange={(muda) =>
            onChange((p) => ({
              ...p,
              takes: p.takes.map((item) => (item.id === take.id ? muda(item) : item)),
            }))
          }
          onRemove={() =>
            onChange((p) => ({
              ...p,
              takes: p.takes.filter((item) => item.id !== take.id),
            }))
          }
        />
      ))}

      <Button
        variant="secondary"
        leftIcon={<PlusIcon size={16} />}
        onClick={() =>
          onChange((p) => ({ ...p, takes: [...p.takes, proximoTakeContinuidade(p)] }))
        }
      >
        Próximo take
      </Button>
    </section>
  );
}

// ---- Take ----

function TakeCard({
  boletimId,
  take,
  onChange,
  onRemove,
}: {
  boletimId: string;
  take: TakeContinuidade;
  onChange: (muda: (t: TakeContinuidade) => TakeContinuidade) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<TakeContinuidade>) => onChange((t) => ({ ...t, ...patch }));
  const setAcao = (campo: CampoAcaoLocal, valor: string) =>
    onChange((t) => ({ ...t, acao: { ...t.acao, [campo]: valor } }));
  const print = take.veredito === 'CIRCLE';
  const preenchidos = CAMPOS_DE_ACAO.flatMap((grupo) => grupo.campos).filter((campo) =>
    take.acao[campo.campo as CampoAcaoLocal]?.trim(),
  );

  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition',
        print ? 'border-approved/50 bg-approved-soft' : 'border-line bg-surface-raised',
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
        {take.problema ? <Badge tone="warning">problema</Badge> : null}
        <span className="flex-1" />
        <IconButton
          label={`Remover take ${take.numero}`}
          variant="danger"
          icon={<TrashIcon size={16} />}
          onClick={onRemove}
        />
      </div>

      <OptionChips
        label="Veredito"
        className="mt-3"
        options={VEREDITO}
        value={take.veredito || null}
        onChange={(valor) => set({ veredito: valor ?? '' })}
      />

      {take.veredito === 'NG' ? (
        <TextField
          label="Motivo do NG"
          className="mt-3"
          value={take.motivoNG}
          placeholder="Ator errou a marca"
          onChange={(motivoNG) => set({ motivoNG })}
        />
      ) : null}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[8rem_1fr]">
        <TextField
          label="Duração"
          clearable={false}
          value={take.duracao}
          placeholder="00:42"
          inputMode="numeric"
          onChange={(duracao) => set({ duracao })}
        />
        <TextField
          label="Ação / observações"
          value={take.observacoes}
          placeholder="João pega o copo com a mão direita"
          onChange={(observacoes) => set({ observacoes })}
        />
      </div>

      <button
        type="button"
        aria-pressed={take.problema}
        onClick={() => set({ problema: !take.problema })}
        className={cn(
          'mt-3 flex min-h-[44px] w-full items-center gap-2 rounded-lg border px-3 text-left text-sm font-medium transition',
          take.problema
            ? 'border-amber-500/60 bg-amber-500/15 text-zinc-100'
            : 'border-line bg-surface text-zinc-400 hover:bg-surface-hover',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs',
            take.problema ? 'border-amber-400 text-amber-400' : 'border-zinc-400',
          )}
        >
          {take.problema ? '!' : ''}
        </span>
        Problema de continuidade
      </button>

      {take.problema ? (
        <TextField
          label="Qual problema"
          className="mt-2"
          value={take.problemaDescricao}
          placeholder="Copo na mão esquerda; no plano 1 estava na direita"
          onChange={(problemaDescricao) => set({ problemaDescricao })}
        />
      ) : null}

      <Dobra
        titulo="Mais campos"
        resumo={preenchidos.length > 0 ? `${preenchidos.length} preenchido(s)` : ''}
      >
        <div className="flex flex-col gap-4">
          {CAMPOS_DE_ACAO.map((grupo) => (
            <div key={grupo.grupo} className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {grupo.grupo}
              </p>
              {grupo.campos.map((campo) => (
                <TextField
                  key={String(campo.campo)}
                  label={campo.rotulo}
                  value={take.acao[campo.campo as CampoAcaoLocal] ?? ''}
                  placeholder={campo.exemplo}
                  onChange={(valor) => setAcao(campo.campo as CampoAcaoLocal, valor)}
                />
              ))}
            </div>
          ))}
        </div>
      </Dobra>

      <NotasEFotos
        boletimId={boletimId}
        rotulo="Raccord e fotos deste take"
        notas={take.notas}
        fotos={take.fotos}
        onNotas={(notas) => set({ notas })}
        onFotos={(fotos) => set({ fotos })}
      />
    </div>
  );
}
