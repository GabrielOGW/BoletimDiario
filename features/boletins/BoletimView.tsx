'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Boletim } from '@/types/boletim';
import type { CenaFolha, ItemFolha, TakeFolha } from './folha';
import { montaFolha } from './folha';
import { getById } from '@/lib/storage';
import { exportBoletim } from '@/lib/backup';
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

/** Um número do resumo da diária. */
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

/** Par rótulo/valor — some quando não há valor, em vez de imprimir um travessão. */
function Info({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div className="min-w-0">
      <dt className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="truncate text-sm text-zinc-900">{value.trim()}</dd>
    </div>
  );
}

/**
 * A régua de takes: um plano inteiro em uma linha.
 * O aprovado é o único que muda de peso — é a informação que a pós procura.
 */
function ReguaDeTakes({ takes }: { takes: TakeFolha[] }) {
  if (takes.length === 0)
    return <span className="text-[10px] italic text-zinc-400">sem takes</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
      {takes.map((take, i) => (
        <span
          key={take.id}
          className={cn(
            'min-w-[1.15rem] rounded-sm px-1 text-center font-mono text-[10px] leading-[1.4]',
            take.aprovado
              ? 'bg-approved font-bold text-white'
              : 'bg-zinc-100 text-zinc-500',
          )}
        >
          {take.aprovado ? '✓' : ''}
          {take.numero || i + 1}
        </span>
      ))}
    </span>
  );
}

/** Um plano: identificação, o que ele tem de diferente, e a régua de takes. */
function LinhaDoPlano({ item }: { item: ItemFolha }) {
  const marcas = [item.camera, item.tipo].filter(Boolean) as string[];
  return (
    <div className="pdf-item border-b border-zinc-100 py-1 last:border-b-0">
      <div className="flex items-baseline gap-2">
        <span className="w-14 shrink-0 font-mono text-[11px] font-bold text-zinc-900">
          {item.ident}
        </span>
        <span className="min-w-0 flex-1 text-[11px] leading-snug text-zinc-600">
          {marcas.length > 0 ? (
            <span className="font-semibold text-zinc-800">{marcas.join(' · ')} </span>
          ) : null}
          {item.ajustes.join(' · ')}
        </span>
        <ReguaDeTakes takes={item.takes} />
      </div>

      {item.detalhes.map((take, i) => (
        <div
          key={take.id}
          className="ml-14 flex gap-2 pl-2 text-[10px] leading-snug text-zinc-600"
        >
          <span className="shrink-0 font-mono font-bold text-zinc-500">
            {take.numero || i + 1}
          </span>
          <span className="min-w-0">
            {take.cartao ? (
              <span className="mr-2 font-mono text-zinc-800">{take.cartao}</span>
            ) : null}
            {take.clipSync ? (
              <span className="mr-2 font-mono text-zinc-800">{take.clipSync}</span>
            ) : null}
            {take.nota}
          </span>
        </div>
      ))}

      {item.observacoes ? (
        <p className="ml-14 pl-2 text-[10px] leading-snug text-zinc-700">
          <span className="font-semibold text-zinc-500">Obs.: </span>
          {item.observacoes}
        </p>
      ) : null}
    </div>
  );
}

/** Uma cena: faixa de título e os planos logo abaixo. */
function BlocoDaCena({ cena }: { cena: CenaFolha }) {
  return (
    <div className="pdf-cena">
      <div className="pdf-cena-header flex items-baseline gap-2 rounded-sm bg-zinc-900 px-2.5 py-1.5 text-white">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-400">
          Cena
        </span>
        <span className="text-base font-black leading-none">{cena.numero}</span>
        {cena.blocoUnico ? (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
            Bloco {cena.blocoUnico}
          </span>
        ) : null}
        <span className="ml-auto text-[9px] uppercase tracking-wide text-zinc-400">
          {cena.planos} planos · {cena.takes} takes · {cena.aprovados} aprov.
        </span>
      </div>
      <div className="mt-0.5">
        {cena.itens.map((item) => (
          <LinhaDoPlano key={item.id} item={item} />
        ))}
      </div>
    </div>
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
        <AppHeader title="Boletim não encontrado" backHref="/legado" />
        <PageContainer className="flex flex-1 items-center justify-center py-20 text-center">
          <p className="text-sm text-zinc-400">
            Este boletim não existe neste dispositivo.
          </p>
        </PageContainer>
      </div>
    );
  }

  const folha = montaFolha(boletim);
  const { producao } = boletim;

  const almoco =
    boletim.horarios.almocoInicio || boletim.horarios.almocoFim
      ? [boletim.horarios.almocoInicio, boletim.horarios.almocoFim]
          .filter((h) => h.trim())
          .join(' – ')
      : boletim.horarios.almoco;

  const tituloProjeto = producao.tituloProjeto.trim() || 'Sem título';
  const dataBR = formatDateBR(producao.data);

  return (
    <div className="app-shell flex min-h-dvh flex-col bg-ink">
      <div className="no-print">
        <AppHeader
          title="Visualizar boletim"
          subtitle={producao.tituloProjeto.trim() || undefined}
          backHref={`/legado/editar?id=${boletim.id}`}
          right={<OfflineBadge />}
        />
      </div>

      <main className="flex-1 py-5">
        <PageContainer className="max-w-none px-0 sm:px-4">
          <article className="print-sheet mx-auto w-full max-w-[820px] rounded-none bg-white p-6 text-zinc-900 shadow-2xl sm:rounded-xl sm:p-9">
            {/* ===== Cabeçalho ===== */}
            <header className="border-b-2 border-zinc-900 pb-3">
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
                  {producao.diretor.trim() ? (
                    <>
                      <dt className="font-semibold text-zinc-500">Direção</dt>
                      <dd>{producao.diretor}</dd>
                    </>
                  ) : null}
                  {producao.diretorFotografia.trim() ? (
                    <>
                      <dt className="font-semibold text-zinc-500">Fotografia</dt>
                      <dd>{producao.diretorFotografia}</dd>
                    </>
                  ) : null}
                </dl>
              </div>
            </header>

            {/* ===== Padrão da diária =====
                A configuração majoritária do dia, escrita uma única vez. É o que
                permite que cada plano abaixo caiba em uma linha. */}
            {folha.padrao.length > 0 ? (
              <section className="mt-3 break-inside-avoid rounded border border-zinc-300 bg-zinc-50 px-3 py-2">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                    Padrão da diária
                  </span>
                  <span className="text-[11px] font-semibold leading-snug text-zinc-900">
                    {folha.padrao.map((campo) => campo.texto).join(' · ')}
                  </span>
                </div>
                <p className="mt-1 text-[9px] italic text-zinc-500">
                  Cada plano lista apenas o que difere deste padrão.
                </p>
              </section>
            ) : null}

            {/* ===== Resumo da diária ===== */}
            <section className="mt-3 break-inside-avoid">
              <div className="grid grid-cols-4 gap-2">
                <StatCard label="Cenas" value={folha.cenas.length} />
                <StatCard label="Planos" value={folha.totalPlanos} />
                <StatCard label="Takes" value={folha.totalTakes} />
                <StatCard label="Aprovados" value={folha.totalAprovados} />
              </div>

              <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                {boletim.camerasCadastradas.length > 0 ? (
                  <ul className="text-[11px] leading-snug text-zinc-700">
                    {boletim.camerasCadastradas.map((cam) => (
                      <li key={cam.id}>
                        <span className="font-semibold text-zinc-900">
                          {cam.nomeId || 'Câmera'}
                        </span>
                        {[
                          cam.modelo,
                          cam.operador && `Op: ${cam.operador}`,
                          cam.foco && `Foco: ${cam.foco}`,
                          cam.claquetista && `Claquete: ${cam.claquetista}`,
                        ]
                          .filter(Boolean)
                          .map((parte) => ` · ${parte}`)
                          .join('')}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {folha.cartoes.length > 0 ? (
                  <p className="text-[11px] leading-snug text-zinc-700">
                    <span className="font-semibold text-zinc-900">Cartões</span>{' '}
                    <span className="font-mono">{folha.cartoes.join(' · ')}</span>
                  </p>
                ) : null}
              </div>
            </section>

            {/* ===== Cenas → Planos → Takes ===== */}
            <section className="mt-5">
              {folha.cenas.length === 0 ? (
                <p className="text-sm text-zinc-500">Nenhuma cena registrada.</p>
              ) : (
                <div className="space-y-3">
                  {folha.cenas.map((cena) => (
                    <BlocoDaCena key={cena.id} cena={cena} />
                  ))}
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
                  <table className="pdf-table w-full border-collapse text-[11px]">
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
                          <td className="py-1 pr-2">{midia.tipoMidia}</td>
                          <td className="py-1 pr-2 font-mono">{midia.numeroCartao}</td>
                          <td className="py-1 pr-2">{midia.quantidade}</td>
                          <td className="py-1">{midia.responsavel}</td>
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
                      <span className="font-medium text-zinc-900">{membro.nome}</span>
                      <span className="text-zinc-500">{membro.funcao}</span>
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
            onClick={() => router.push(`/legado/editar?id=${boletim.id}`)}
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
