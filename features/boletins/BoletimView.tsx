'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Boletim } from '@/types/boletim';
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
  const { producao, camera } = boletim;

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
                <dt className="font-semibold text-zinc-500">Câmera</dt>
                <dd>{camera.numeroId || '—'}</dd>
              </dl>
            </header>

            {/* Produção + Câmera */}
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
                  Câmera
                </h2>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <Spec label="Modelo" value={camera.modelo} />
                  <Spec label="Operador(a)" value={camera.operador} />
                  <Spec label="Foco" value={camera.foco} />
                  <Spec label="Claquetista" value={camera.claquetista} />
                </dl>
              </section>
            </div>

            {/* Cenas */}
            <SheetBlock title={`Cenas (${stats.totalCenas})`}>
              {boletim.cenas.length === 0 ? (
                <p className="text-sm text-zinc-500">Nenhuma cena registrada.</p>
              ) : (
                <div className="space-y-3">
                  {boletim.cenas.map((cena) => {
                    const aprovados = cena.takes.filter((t) => t.aprovado).length;
                    return (
                      <div
                        key={cena.id}
                        className="break-inside-avoid overflow-hidden rounded-md border border-zinc-300"
                      >
                        <div className="flex items-center justify-between gap-2 bg-zinc-100 px-3 py-1.5">
                          <h3 className="font-bold text-zinc-900">
                            Cena {cena.numeroNome.trim() || 'sem número'}
                          </h3>
                          <span className="text-xs text-zinc-600">
                            {aprovados} aprovado(s) · {cena.takes.length} take(s)
                          </span>
                        </div>
                        <div className="p-3">
                          <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
                            <Spec label="Formato" value={cena.tecnica.formatoGravacao} />
                            <Spec label="Resolução" value={cena.tecnica.resolucao} />
                            <Spec label="Frame rate" value={cena.tecnica.frameRate} />
                            <Spec label="ISO / ASA" value={cena.tecnica.iso} />
                            <Spec label="Obturador" value={cena.tecnica.obturador} />
                            <Spec
                              label="Balanço de branco"
                              value={cena.tecnica.balancoBranco}
                            />
                            <Spec label="LUT / Perfil" value={cena.tecnica.lutPerfil} />
                            <Spec label="Espaço de cor" value={cena.tecnica.espacoCor} />
                            <Spec label="Diafragma" value={cena.tecnica.diafragma} />
                            <Spec label="Lente(s)" value={cena.optica.lentes} />
                            <Spec label="Filtros" value={cena.optica.filtros} />
                            <Spec
                              label="Matte Box"
                              value={cena.optica.matteBox ? 'Sim' : 'Não'}
                            />
                            <Spec label="Cartão / Rolo" value={cena.cartaoRolo} />
                          </dl>
                          {cena.observacoes.trim() ? (
                            <p className="mt-2 text-sm">
                              <span className="font-semibold text-zinc-500">Obs.: </span>
                              {cena.observacoes}
                            </p>
                          ) : null}

                          {cena.takes.length > 0 ? (
                            <ul className="mt-3 border-t border-zinc-200">
                              {cena.takes.map((take) => (
                                <li
                                  key={take.id}
                                  className={cn(
                                    'flex items-center gap-2 border-b border-zinc-200 py-1.5 text-sm',
                                    take.aprovado && 'bg-approved-soft/60',
                                  )}
                                >
                                  <span className="w-10 shrink-0 font-mono text-zinc-500">
                                    #{take.numero || '—'}
                                  </span>
                                  <span
                                    className={cn(
                                      'flex-1',
                                      take.aprovado && 'font-semibold text-zinc-900',
                                    )}
                                  >
                                    {take.observacao.trim() || '—'}
                                  </span>
                                  {take.aprovado ? (
                                    <span className="rounded bg-approved px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                      Aprovado
                                    </span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
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
                  <Spec label="Almoço" value={boletim.horarios.almoco} />
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
