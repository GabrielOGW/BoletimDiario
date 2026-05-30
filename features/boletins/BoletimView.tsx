'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Boletim, Plano } from '@/types/boletim';
import { getById } from '@/lib/storage';
import { exportBoletim } from '@/lib/backup';
import { computeStats } from '@/utils/boletim-stats';
import { formatDateBR, formatDateTimeBR } from '@/utils/date';
import { useMounted } from '@/hooks/useMounted';
import { cn } from '@/utils/cn';

import { AppHeader } from '@/components/layout/AppHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { StickyActionBar } from '@/components/layout/StickyActionBar';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { OfflineBadge } from '@/components/pwa/OfflineBadge';
import { DownloadIcon, PencilIcon, PrinterIcon } from '@/components/ui/icons';

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="text-sm text-zinc-900">{value.trim() || '—'}</dd>
    </div>
  );
}

function SheetBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 break-inside-avoid">
      <h2 className="mb-2 border-b border-zinc-300 pb-1 text-xs font-bold uppercase tracking-widest text-zinc-700">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function BoletimView({ id }: { id: string | null }) {
  const router = useRouter();
  const mounted = useMounted();
  const [boletim, setBoletim] = useState<Boletim | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) {
      setNotFound(true);
      return;
    }
    const found = getById(id);
    if (found) setBoletim(found);
    else setNotFound(true);
  }, [id]);

  if (!mounted) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink text-sm text-zinc-500">
        Carregando…
      </div>
    );
  }

  if (notFound || !boletim) {
    return (
      <div className="flex min-h-dvh flex-col bg-ink">
        <AppHeader title="Boletim não encontrado" backHref="/" />
        <PageContainer className="flex flex-1 items-center justify-center py-20 text-center">
          <p className="text-sm text-zinc-400">
            Este boletim não existe neste dispositivo.
          </p>
        </PageContainer>
      </div>
    );
  }

  const stats = computeStats(boletim);
  const { producao } = boletim;

  const cameraName = (plano: Plano): string =>
    boletim.camerasCadastradas.find((cam) => cam.id === plano.cameraId)?.nomeId ||
    plano.cameraNome ||
    '—';

  const almoco =
    boletim.horarios.almocoInicio || boletim.horarios.almocoFim
      ? `${boletim.horarios.almocoInicio || '—'} – ${boletim.horarios.almocoFim || '—'}`
      : boletim.horarios.almoco;

  return (
    <div className="app-shell flex min-h-dvh flex-col bg-ink">
      <div className="no-print">
        <AppHeader
          title="Visualizar boletim"
          subtitle={producao.tituloProjeto.trim() || undefined}
          backHref={`/editar?id=${boletim.id}`}
          right={<OfflineBadge />}
        />
      </div>

      <main className="flex-1 py-5">
        <PageContainer className="max-w-none px-0 sm:px-4">
          <article className="print-sheet mx-auto w-full max-w-[820px] rounded-none bg-white p-6 text-zinc-900 shadow-2xl sm:rounded-xl sm:p-9">
            {/* Cabeçalho */}
            <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-zinc-900 pb-4">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                  Boletim Diário de Câmera
                </p>
                <h1 className="mt-1 text-2xl font-bold leading-tight text-zinc-900">
                  {producao.tituloProjeto.trim() || 'Sem título'}
                </h1>
                <p className="text-sm text-zinc-600">
                  {producao.produtora.trim() || 'Sem produtora'}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-5 gap-y-1 text-sm sm:text-right">
                <dt className="font-semibold text-zinc-500">Data</dt>
                <dd>{formatDateBR(producao.data)}</dd>
                <dt className="font-semibold text-zinc-500">Diária</dt>
                <dd>{producao.diaDiaria || '—'}</dd>
                <dt className="font-semibold text-zinc-500">Câmeras</dt>
                <dd>{boletim.camerasCadastradas.length || '—'}</dd>
              </dl>
            </header>

            {/* Produção + Câmeras */}
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <section className="break-inside-avoid">
                <h2 className="mb-2 border-b border-zinc-300 pb-1 text-xs font-bold uppercase tracking-widest text-zinc-700">
                  Produção
                </h2>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <Spec label="Diretor(a)" value={producao.diretor} />
                  <Spec label="Dir. de Fotografia" value={producao.diretorFotografia} />
                </dl>
              </section>
              <section className="break-inside-avoid">
                <h2 className="mb-2 border-b border-zinc-300 pb-1 text-xs font-bold uppercase tracking-widest text-zinc-700">
                  Câmeras
                </h2>
                {boletim.camerasCadastradas.length === 0 ? (
                  <p className="text-sm text-zinc-500">Nenhuma câmera cadastrada.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {boletim.camerasCadastradas.map((cam) => (
                      <li key={cam.id} className="text-sm">
                        <span className="font-semibold text-zinc-900">
                          {cam.nomeId || '—'}
                        </span>
                        {cam.modelo ? (
                          <span className="text-zinc-600"> · {cam.modelo}</span>
                        ) : null}
                        {cam.operador ? (
                          <span className="block text-xs text-zinc-500">
                            Op: {cam.operador}
                            {cam.foco ? ` · Foco: ${cam.foco}` : ''}
                            {cam.claquetista ? ` · Claq: ${cam.claquetista}` : ''}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            {/* Cenas → Blocos → Planos → Takes */}
            <SheetBlock
              title={`Cenas (${stats.totalCenas}) · ${stats.totalPlanos} planos`}
            >
              {boletim.cenas.length === 0 ? (
                <p className="text-sm text-zinc-500">Nenhuma cena registrada.</p>
              ) : (
                <div className="space-y-4">
                  {boletim.cenas.map((cena) => (
                    <div key={cena.id} className="break-inside-avoid">
                      <h3 className="mb-2 text-base font-bold text-zinc-900">
                        Cena {cena.numero.trim() || 'sem número'}
                      </h3>
                      <div className="space-y-3 border-l-2 border-zinc-200 pl-3">
                        {cena.blocos.map((bloco) => (
                          <div key={bloco.id}>
                            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-zinc-500">
                              Bloco {bloco.letra || '—'}
                            </p>
                            <div className="space-y-2.5">
                              {bloco.planos.map((plano) => {
                                const aprovados = plano.takes.filter(
                                  (take) => take.aprovado,
                                ).length;
                                return (
                                  <div
                                    key={plano.id}
                                    className="break-inside-avoid overflow-hidden rounded-md border border-zinc-300"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-100 px-3 py-1.5">
                                      <h4 className="text-sm font-bold text-zinc-900">
                                        Plano {plano.numero.trim() || '—'}
                                        {plano.tipo && plano.tipo !== 'Normal' ? (
                                          <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                            {plano.tipo}
                                          </span>
                                        ) : null}
                                      </h4>
                                      <span className="text-xs text-zinc-600">
                                        {cameraName(plano)} · {aprovados} aprovado(s) ·{' '}
                                        {plano.takes.length} take(s)
                                      </span>
                                    </div>
                                    <div className="p-3">
                                      <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
                                        <Spec
                                          label="Formato"
                                          value={plano.tecnica.formatoGravacao}
                                        />
                                        <Spec
                                          label="Resolução"
                                          value={plano.tecnica.resolucao}
                                        />
                                        <Spec
                                          label="Frame rate"
                                          value={plano.tecnica.frameRate}
                                        />
                                        <Spec
                                          label="ISO / ASA"
                                          value={plano.tecnica.iso}
                                        />
                                        <Spec
                                          label="Obturador"
                                          value={plano.tecnica.obturador}
                                        />
                                        <Spec
                                          label="WB"
                                          value={plano.tecnica.balancoBranco}
                                        />
                                        <Spec
                                          label="LUT / Perfil"
                                          value={plano.tecnica.lutPerfil}
                                        />
                                        <Spec
                                          label="Espaço de cor"
                                          value={plano.tecnica.espacoCor}
                                        />
                                        <Spec
                                          label="Diafragma"
                                          value={plano.tecnica.diafragma}
                                        />
                                        <Spec
                                          label="Lente(s)"
                                          value={plano.optica.lentes}
                                        />
                                        <Spec
                                          label="Filtros"
                                          value={plano.optica.filtros}
                                        />
                                        <Spec
                                          label="Matte Box"
                                          value={plano.optica.matteBox ? 'Sim' : 'Não'}
                                        />
                                      </dl>
                                      {plano.observacoes.trim() ? (
                                        <p className="mt-2 text-sm">
                                          <span className="font-semibold text-zinc-500">
                                            Obs.:{' '}
                                          </span>
                                          {plano.observacoes}
                                        </p>
                                      ) : null}

                                      {plano.takes.length > 0 ? (
                                        <table className="mt-3 w-full border-collapse text-sm">
                                          <thead>
                                            <tr className="border-b border-zinc-300 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                                              <th className="w-10 py-1 pr-2 font-semibold">
                                                #
                                              </th>
                                              <th className="py-1 pr-2 font-semibold">
                                                Cartão
                                              </th>
                                              <th className="py-1 pr-2 font-semibold">
                                                Clip/Sync
                                              </th>
                                              <th className="py-1 pr-2 font-semibold">
                                                Nota
                                              </th>
                                              <th className="py-1 font-semibold">
                                                Aprov.
                                              </th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {plano.takes.map((take) => (
                                              <tr
                                                key={take.id}
                                                className={cn(
                                                  'border-b border-zinc-100 align-top',
                                                  take.aprovado &&
                                                    'bg-approved-soft/60 font-semibold text-zinc-900',
                                                )}
                                              >
                                                <td className="py-1 pr-2 font-mono">
                                                  {take.numero || '—'}
                                                </td>
                                                <td className="py-1 pr-2">
                                                  {take.cartao || '—'}
                                                </td>
                                                <td className="py-1 pr-2">
                                                  {take.clipSync || '—'}
                                                </td>
                                                <td className="py-1 pr-2">
                                                  {take.notaOperacional || '—'}
                                                </td>
                                                <td className="py-1">
                                                  {take.aprovado ? (
                                                    <span className="rounded bg-approved px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                                      Sim
                                                    </span>
                                                  ) : (
                                                    '—'
                                                  )}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SheetBlock>

            {/* Mídia / Suporte */}
            {boletim.midiaSuporte.length > 0 ? (
              <SheetBlock title="Mídia / Suporte">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
                      <th className="py-1 pr-2 font-semibold">Tipo</th>
                      <th className="py-1 pr-2 font-semibold">Nº cartão</th>
                      <th className="py-1 pr-2 font-semibold">Qtd.</th>
                      <th className="py-1 font-semibold">Responsável</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boletim.midiaSuporte.map((midia) => (
                      <tr key={midia.id} className="border-b border-zinc-100">
                        <td className="py-1 pr-2">{midia.tipoMidia || '—'}</td>
                        <td className="py-1 pr-2">{midia.numeroCartao || '—'}</td>
                        <td className="py-1 pr-2">{midia.quantidade || '—'}</td>
                        <td className="py-1">{midia.responsavel || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </SheetBlock>
            ) : null}

            {/* Cenas do dia + Horários */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <SheetBlock title="Cenas do dia">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <Spec
                    label="Cenas realizadas"
                    value={boletim.cenasDoDia.cenasRealizadas}
                  />
                  <Spec label="Continuidade" value={boletim.cenasDoDia.continuidade} />
                  <Spec
                    label="Total de takes"
                    value={boletim.cenasDoDia.totalTakes || String(stats.totalTakes)}
                  />
                  <Spec
                    label="Tomadas aprovadas"
                    value={
                      boletim.cenasDoDia.tomadasAprovadas || String(stats.takesAprovados)
                    }
                  />
                </dl>
              </SheetBlock>
              <SheetBlock title="Horários">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <Spec label="Início" value={boletim.horarios.inicio} />
                  <Spec label="Fim" value={boletim.horarios.fim} />
                  <Spec label="Almoço" value={almoco} />
                  <Spec label="Total de horas" value={boletim.horarios.totalHoras} />
                  <Spec label="Hora extra" value={boletim.horarios.horaExtra} />
                </dl>
              </SheetBlock>
            </div>

            {/* Equipe */}
            {boletim.equipeCamera.length > 0 ? (
              <SheetBlock title="Equipe de câmera">
                <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {boletim.equipeCamera.map((membro) => (
                    <li key={membro.id} className="flex justify-between gap-3 text-sm">
                      <span className="font-medium text-zinc-900">
                        {membro.nome || '—'}
                      </span>
                      <span className="text-zinc-500">{membro.funcao || '—'}</span>
                    </li>
                  ))}
                </ul>
              </SheetBlock>
            ) : null}

            {/* Observações gerais */}
            {boletim.observacoesGerais.trim() ? (
              <SheetBlock title="Observações gerais">
                <p className="whitespace-pre-wrap text-sm text-zinc-800">
                  {boletim.observacoesGerais}
                </p>
              </SheetBlock>
            ) : null}

            <footer className="mt-8 border-t border-zinc-200 pt-3 text-center text-[10px] text-zinc-400">
              Gerado em {formatDateTimeBR(new Date().toISOString())} · Boletim Diário de
              Câmera
            </footer>
          </article>
        </PageContainer>
      </main>

      <div className="no-print">
        <StickyActionBar>
          <IconButton
            label="Editar boletim"
            variant="surface"
            icon={<PencilIcon size={18} />}
            onClick={() => router.push(`/editar?id=${boletim.id}`)}
          />
          <IconButton
            label="Exportar este boletim em JSON"
            variant="surface"
            icon={<DownloadIcon size={18} />}
            onClick={() => exportBoletim(boletim)}
          />
          <Button
            variant="primary"
            fullWidth
            leftIcon={<PrinterIcon size={18} />}
            onClick={() => window.print()}
          >
            Imprimir / PDF
          </Button>
        </StickyActionBar>
      </div>
    </div>
  );
}
