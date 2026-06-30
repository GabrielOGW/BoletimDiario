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

/** Pequeno cartão de estatística para o resumo da diária. */
function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-center">
      <div className="text-lg font-bold leading-none text-zinc-900">{value}</div>
      <div className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="truncate text-sm text-zinc-900">{value.trim() || '—'}</dd>
    </div>
  );
}

/** Assinatura técnica de um plano — planos iguais (consecutivos) são agrupados. */
function planoSignature(plano: Plano, camName: string): string {
  return JSON.stringify([camName, plano.tipo, plano.tecnica, plano.optica]);
}

/** Setup técnico compacto, só com campos preenchidos. */
function setupParts(plano: Plano, camName: string): string[] {
  const t = plano.tecnica;
  const o = plano.optica;
  const parts: string[] = [];
  if (camName && camName !== '—') parts.push(camName);
  if (plano.tipo && plano.tipo !== 'Normal') parts.push(plano.tipo);
  if (t.formatoGravacao) parts.push(t.formatoGravacao);
  if (t.resolucao) parts.push(t.resolucao);
  if (t.frameRate) parts.push(`${t.frameRate} fps`);
  if (t.iso) parts.push(`ISO ${t.iso}`);
  if (t.obturador) parts.push(`${t.obturador}°`);
  if (t.balancoBranco) parts.push(t.balancoBranco);
  if (t.lutPerfil) parts.push(t.lutPerfil);
  if (t.espacoCor) parts.push(t.espacoCor);
  if (o.lentes) parts.push(o.lentes);
  if (o.filtros) parts.push(o.filtros);
  if (t.diafragma) parts.push(t.diafragma);
  if (o.matteBox) parts.push('Matte Box');
  return parts;
}

interface PlanoGroup {
  signature: string;
  planos: Plano[];
}

function groupPlanos(planos: Plano[], camName: (p: Plano) => string): PlanoGroup[] {
  const groups: PlanoGroup[] = [];
  for (const plano of planos) {
    const signature = planoSignature(plano, camName(plano));
    const last = groups[groups.length - 1];
    if (last && last.signature === signature) last.planos.push(plano);
    else groups.push({ signature, planos: [plano] });
  }
  return groups;
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

  // Cartões usados (distintos) — takes + inventário de mídia.
  const cartoes = new Set<string>();
  for (const cena of boletim.cenas)
    for (const bloco of cena.blocos)
      for (const plano of bloco.planos)
        for (const take of plano.takes) if (take.cartao.trim()) cartoes.add(take.cartao.trim());
  for (const midia of boletim.midiaSuporte)
    if (midia.numeroCartao.trim()) cartoes.add(midia.numeroCartao.trim());
  const cartoesUsados = [...cartoes].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const tituloProjeto = producao.tituloProjeto.trim() || 'Sem título';
  const dataBR = formatDateBR(producao.data);

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
            {/* ===== Cabeçalho ===== */}
            <header className="border-b-2 border-zinc-900 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 border-l-4 border-brand pl-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-zinc-500">
                    Boletim Diário de Câmera
                  </p>
                  <h1 className="mt-0.5 text-2xl font-black leading-tight text-zinc-900">
                    {tituloProjeto}
                  </h1>
                  <p className="text-sm text-zinc-600">
                    {producao.produtora.trim() || 'Sem produtora'}
                  </p>
                </div>
                <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-sm sm:text-right">
                  <dt className="font-semibold text-zinc-500">Data</dt>
                  <dd className="font-semibold">{dataBR}</dd>
                  <dt className="font-semibold text-zinc-500">Diária</dt>
                  <dd className="font-semibold">{producao.diaDiaria || '—'}</dd>
                  <dt className="font-semibold text-zinc-500">Diretor(a)</dt>
                  <dd>{producao.diretor || '—'}</dd>
                  <dt className="font-semibold text-zinc-500">Fotografia</dt>
                  <dd>{producao.diretorFotografia || '—'}</dd>
                </dl>
              </div>
            </header>

            {/* ===== Resumo da diária ===== */}
            <section className="mt-4 break-inside-avoid">
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-zinc-700">
                Resumo da diária
              </h2>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                <StatCard label="Câmeras" value={boletim.camerasCadastradas.length} />
                <StatCard label="Cenas" value={stats.totalCenas} />
                <StatCard label="Blocos" value={stats.totalBlocos} />
                <StatCard label="Planos" value={stats.totalPlanos} />
                <StatCard label="Takes" value={stats.totalTakes} />
                <StatCard label="Aprovados" value={stats.takesAprovados} />
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {boletim.camerasCadastradas.length > 0 ? (
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                      Câmeras
                    </p>
                    <ul className="mt-0.5 text-xs text-zinc-700">
                      {boletim.camerasCadastradas.map((cam) => (
                        <li key={cam.id}>
                          <span className="font-semibold text-zinc-900">
                            {cam.nomeId || '—'}
                          </span>
                          {cam.modelo ? ` · ${cam.modelo}` : ''}
                          {cam.operador ? ` · Op: ${cam.operador}` : ''}
                          {cam.foco ? ` · Foco: ${cam.foco}` : ''}
                          {cam.claquetista ? ` · Claquete: ${cam.claquetista}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                    Cartões usados ({cartoesUsados.length})
                  </p>
                  {cartoesUsados.length === 0 ? (
                    <p className="mt-0.5 text-xs text-zinc-400">—</p>
                  ) : (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {cartoesUsados.map((cartao) => (
                        <span
                          key={cartao}
                          className="rounded border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] text-zinc-800"
                        >
                          {cartao}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* ===== Cenas → Blocos → Planos → Takes ===== */}
            <section className="mt-6">
              {boletim.cenas.length === 0 ? (
                <p className="text-sm text-zinc-500">Nenhuma cena registrada.</p>
              ) : (
                <div className="space-y-5">
                  {boletim.cenas.map((cena) => {
                    let cenaPlanos = 0;
                    let cenaAprov = 0;
                    for (const bloco of cena.blocos) {
                      cenaPlanos += bloco.planos.length;
                      for (const plano of bloco.planos)
                        cenaAprov += plano.takes.filter((t) => t.aprovado).length;
                    }
                    return (
                      <div key={cena.id} className="pdf-cena">
                        {/* CENA = capítulo */}
                        <div className="pdf-cena-header flex items-center gap-3 rounded-sm bg-zinc-900 px-3 py-2 text-white">
                          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
                            Cena
                          </span>
                          <span className="text-lg font-black leading-none">
                            {cena.numero.trim() || 'S/N'}
                          </span>
                          <span className="ml-auto text-[10px] uppercase tracking-wide text-zinc-400">
                            {cena.blocos.length} blocos · {cenaPlanos} planos · {cenaAprov}{' '}
                            aprov.
                          </span>
                        </div>

                        <div className="mt-2 space-y-3">
                          {cena.blocos.map((bloco) => (
                            <div key={bloco.id}>
                              {/* BLOCO = seção */}
                              <div className="pdf-bloco-header flex items-center gap-2 border-b-2 border-zinc-300 pb-1">
                                <span className="rounded bg-zinc-200 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-700">
                                  Bloco {bloco.letra || '—'}
                                </span>
                                <span className="text-[10px] text-zinc-400">
                                  {bloco.planos.length}{' '}
                                  {bloco.planos.length === 1 ? 'plano' : 'planos'}
                                </span>
                              </div>

                              <div className="mt-2 space-y-2.5">
                                {groupPlanos(bloco.planos, cameraName).map((group) => {
                                  const head = group.planos[0];
                                  const parts = setupParts(head, cameraName(head));
                                  const planosLabel = group.planos
                                    .map((p) => `Plano ${p.numero.trim() || 'S/N'}`)
                                    .join(' · ');
                                  const multi = group.planos.length > 1;
                                  return (
                                    <div key={group.planos[0].id}>
                                      {/* Setup compartilhado (reduz repetição) */}
                                      <div className="pdf-setup rounded border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[11px] leading-snug">
                                        <span className="font-bold text-zinc-900">
                                          {planosLabel}
                                        </span>
                                        {parts.length > 0 ? (
                                          <span className="text-zinc-600">
                                            {' '}
                                            — {parts.join(' · ')}
                                          </span>
                                        ) : null}
                                      </div>

                                      {group.planos.map((plano) => (
                                        <div key={plano.id} className="pdf-plano mt-1.5">
                                          {multi ? (
                                            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                                              Plano {plano.numero.trim() || 'S/N'}
                                            </p>
                                          ) : null}
                                          {plano.takes.length === 0 ? (
                                            <p className="py-1 text-[11px] italic text-zinc-400">
                                              Sem takes registrados.
                                            </p>
                                          ) : (
                                            <table className="pdf-table w-full table-fixed border-collapse text-[11px]">
                                              <colgroup>
                                                <col className="w-[7%]" />
                                                <col className="w-[13%]" />
                                                <col className="w-[15%]" />
                                                <col className="w-[17%]" />
                                                <col />
                                                <col className="w-[20%]" />
                                              </colgroup>
                                              <thead>
                                                <tr className="border-y border-zinc-300 bg-zinc-100 text-left text-[9px] uppercase tracking-wide text-zinc-600">
                                                  <th className="px-1.5 py-1 font-bold">#</th>
                                                  <th className="px-1.5 py-1 font-bold">Cam</th>
                                                  <th className="px-1.5 py-1 font-bold">Cartão</th>
                                                  <th className="px-1.5 py-1 font-bold">Clip/Sync</th>
                                                  <th className="px-1.5 py-1 font-bold">Nota</th>
                                                  <th className="px-1.5 py-1 font-bold">Status</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {plano.takes.map((take) => (
                                                  <tr
                                                    key={take.id}
                                                    className={cn(
                                                      'border-b border-zinc-200 align-top',
                                                      take.aprovado &&
                                                        'bg-approved-soft/50',
                                                    )}
                                                  >
                                                    <td
                                                      className={cn(
                                                        'px-1.5 py-1 font-mono font-bold',
                                                        take.aprovado &&
                                                          'border-l-[3px] border-approved',
                                                      )}
                                                    >
                                                      {take.numero || '—'}
                                                    </td>
                                                    <td className="px-1.5 py-1">
                                                      {cameraName(plano)}
                                                    </td>
                                                    <td className="px-1.5 py-1 font-mono">
                                                      {take.cartao || '—'}
                                                    </td>
                                                    <td className="px-1.5 py-1 font-mono">
                                                      {take.clipSync || '—'}
                                                    </td>
                                                    <td
                                                      className={cn(
                                                        'px-1.5 py-1 break-words',
                                                        take.aprovado &&
                                                          'font-semibold text-zinc-900',
                                                      )}
                                                    >
                                                      {take.notaOperacional || '—'}
                                                    </td>
                                                    <td className="px-1.5 py-1">
                                                      {take.aprovado ? (
                                                        <span className="inline-block rounded bg-approved px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                                                          ✓ Aprovado
                                                        </span>
                                                      ) : (
                                                        <span className="text-zinc-300">—</span>
                                                      )}
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          )}
                                          {plano.observacoes.trim() ? (
                                            <p className="mt-1 text-[11px] text-zinc-700">
                                              <span className="font-semibold text-zinc-500">
                                                Obs.:{' '}
                                              </span>
                                              {plano.observacoes}
                                            </p>
                                          ) : null}
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ===== Mídia / Horários / Equipe ===== */}
            <section className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
              {boletim.midiaSuporte.length > 0 ? (
                <div className="break-inside-avoid">
                  <h2 className="mb-2 border-b border-zinc-300 pb-1 text-[11px] font-bold uppercase tracking-widest text-zinc-700">
                    Mídia / Suporte
                  </h2>
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="border-b border-zinc-300 text-left text-[9px] uppercase tracking-wide text-zinc-500">
                        <th className="py-1 pr-2 font-bold">Tipo</th>
                        <th className="py-1 pr-2 font-bold">Cartão</th>
                        <th className="py-1 pr-2 font-bold">Qtd</th>
                        <th className="py-1 font-bold">Resp.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {boletim.midiaSuporte.map((midia) => (
                        <tr key={midia.id} className="border-b border-zinc-100">
                          <td className="py-1 pr-2">{midia.tipoMidia || '—'}</td>
                          <td className="py-1 pr-2 font-mono">{midia.numeroCartao || '—'}</td>
                          <td className="py-1 pr-2">{midia.quantidade || '—'}</td>
                          <td className="py-1">{midia.responsavel || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <div className="break-inside-avoid">
                <h2 className="mb-2 border-b border-zinc-300 pb-1 text-[11px] font-bold uppercase tracking-widest text-zinc-700">
                  Horários
                </h2>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <Info label="Início" value={boletim.horarios.inicio} />
                  <Info label="Fim" value={boletim.horarios.fim} />
                  <Info label="Almoço" value={almoco} />
                  <Info label="Total de horas" value={boletim.horarios.totalHoras} />
                  <Info label="Hora extra" value={boletim.horarios.horaExtra} />
                  <Info label="Continuidade" value={boletim.cenasDoDia.continuidade} />
                </dl>
              </div>
            </section>

            {boletim.equipeCamera.length > 0 ? (
              <section className="mt-5 break-inside-avoid">
                <h2 className="mb-2 border-b border-zinc-300 pb-1 text-[11px] font-bold uppercase tracking-widest text-zinc-700">
                  Equipe de câmera
                </h2>
                <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                  {boletim.equipeCamera.map((membro) => (
                    <li
                      key={membro.id}
                      className="flex justify-between gap-3 border-b border-zinc-100 py-0.5 text-[11px]"
                    >
                      <span className="font-medium text-zinc-900">{membro.nome || '—'}</span>
                      <span className="text-zinc-500">{membro.funcao || '—'}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {boletim.observacoesGerais.trim() ? (
              <section className="mt-5 break-inside-avoid">
                <h2 className="mb-2 border-b border-zinc-300 pb-1 text-[11px] font-bold uppercase tracking-widest text-zinc-700">
                  Observações gerais
                </h2>
                <p className="whitespace-pre-wrap text-[11px] text-zinc-800">
                  {boletim.observacoesGerais}
                </p>
              </section>
            ) : null}

            {/* ===== Footer próprio ===== */}
            <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t-2 border-zinc-900 pt-2 text-[10px] text-zinc-500">
              <span className="font-bold uppercase tracking-wide text-zinc-700">
                Boletim Diário de Câmera
              </span>
              <span className="truncate">
                {tituloProjeto} · {dataBR}
                {producao.diaDiaria ? ` · Diária ${producao.diaDiaria}` : ''}
              </span>
              <span>Gerado em {formatDateTimeBR(new Date().toISOString())}</span>
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
