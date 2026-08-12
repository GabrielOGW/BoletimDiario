'use client';

import { cameraTakeDataId } from '@/lib/offline/repos/camera';
import type {
  LocalCameraTakeData,
  LocalCameraUnit,
  LocalScene,
  LocalSetup,
  LocalTake,
} from '@/lib/offline/db';
import { formatDateTimeBR } from '@/utils/date';
import { cn } from '@/utils/cn';

import {
  agrupaCenas,
  assinaturaDoPlano,
  diferencasDoPlano,
  partesTecnicas,
  rotuloDoJulgamento,
  rotuloDoTipo,
} from './estrutura';

/**
 * A folha A4 do Boletim de Câmera — HTML + CSS de impressão, sem biblioteca de PDF.
 *
 * Mesma abordagem validada no boletim atual (`features/boletins/BoletimView.tsx`) e as
 * mesmas classes de impressão do `globals.css`: `print-sheet`, `pdf-cena`, `pdf-plano`,
 * `pdf-table`. O que muda é só a origem do dado — cena, plano e take vêm do banco local,
 * e o cabeçalho vem da sala.
 *
 * **Nenhum `fetch` e nenhuma consulta:** tudo chega por props, já lido pela tela. É o que
 * garante que imprimir funcione com o aparelho em modo avião, que é quando o boletim
 * costuma ser fechado.
 */

/** O que vem da sala — dado de servidor, somente leitura (ADR-016). */
export interface CabecalhoImpressao {
  producao: {
    name: string;
    company: string | null;
    director: string | null;
    dop: string | null;
  };
  diaria: {
    date: string;
    dayNumber: string | null;
    callTime: string | null;
    wrapTime: string | null;
    lunchStart: string | null;
    lunchEnd: string | null;
    location: string | null;
    unit: string | null;
    notes: string | null;
  };
  equipe: { id: string; nome: string; funcao: string }[];
  /**
   * O equipamento alocado na diária, já descrito em texto (Fase 8).
   *
   * Vem da sala, resolvido no servidor, como o resto deste objeto — o catálogo está fora
   * da fronteira offline (ADR-016) e a navegação renderizada fica no cache do Service
   * Worker, então o cabeçalho continua saindo impresso em locação sem sinal.
   *
   * Opcional: uma produção que não cadastrou equipamento imprime o boletim sem a seção,
   * exatamente como imprimia antes.
   */
  equipamentos?: { id: string; departamento: string; descricao: string }[];
}

export interface FolhaCameraProps {
  cabecalho: CabecalhoImpressao;
  cenas: LocalScene[];
  setups: LocalSetup[];
  takes: LocalTake[];
  dadosCamera: LocalCameraTakeData[];
  cameras: LocalCameraUnit[];
}

const hora = (valor: string | null | undefined) => valor?.slice(0, 5) ?? '';

/** `2026-08-11` → `11/08/2026`. Sem `Date`: a diária é dia civil, não instante (R9). */
function dataBR(date: string): string {
  const [ano, mes, dia] = date.split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : date || '—';
}

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

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 border-b border-zinc-300 pb-1 text-[11px] font-bold uppercase tracking-widest text-zinc-700">
      {children}
    </h2>
  );
}

export function FolhaCamera({
  cabecalho,
  cenas,
  setups,
  takes,
  dadosCamera,
  cameras,
}: FolhaCameraProps) {
  const { producao, diaria, equipe } = cabecalho;

  /** Só o equipamento de Câmera: o boom não interessa a este cabeçalho. */
  const equipamentos = (cabecalho.equipamentos ?? []).filter(
    (item) => item.departamento === 'CAMERA',
  );

  const agrupadas = agrupaCenas(cenas);
  const takesDoSetup = (setupId: string) =>
    takes.filter((take) => take.setupId === setupId).sort((a, b) => a.number - b.number);

  /** A câmera do plano mora em `setup.name` — ver a nota em `PlanoCard`. */
  const cameraDoSetup = (setup: LocalSetup) =>
    cameras.find((camera) => camera.id === setup.name) ?? null;

  const dadosDoTake = (setup: LocalSetup, take: LocalTake) =>
    dadosCamera.find((dado) => dado.id === cameraTakeDataId(take.id, setup.name ?? null));

  /** O plano é impresso com a técnica do seu primeiro take — o que ele foi configurado. */
  const dadosDoPlano = (setup: LocalSetup) => {
    const primeiro = takesDoSetup(setup.id)[0];
    return primeiro ? dadosDoTake(setup, primeiro) : undefined;
  };

  const assinatura = (setup: LocalSetup) =>
    assinaturaDoPlano(cameraDoSetup(setup)?.label ?? '', dadosDoPlano(setup), setup.kind);

  const aprovados = dadosCamera.filter((dado) => dado.approved).length;

  const distintos = (campo: 'card' | 'roll') =>
    [
      ...new Set(
        dadosCamera.flatMap((dado) => {
          const valor = String(dado[campo] ?? '').trim();
          return valor ? [valor] : [];
        }),
      ),
    ].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));

  const cartoes = distintos('card');
  const rolls = distintos('roll');

  const titulo = producao.name.trim() || 'Sem título';
  const data = dataBR(diaria.date);

  const almoco =
    hora(diaria.lunchStart) || hora(diaria.lunchEnd)
      ? `${hora(diaria.lunchStart) || '—'} – ${hora(diaria.lunchEnd) || '—'}`
      : '';

  return (
    <article className="print-sheet mx-auto w-full max-w-[820px] rounded-none bg-white p-6 text-zinc-900 shadow-2xl sm:rounded-xl sm:p-9">
      {/* ===== Cabeçalho ===== */}
      <header className="border-b-2 border-zinc-900 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 border-l-4 border-brand pl-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-zinc-500">
              Boletim Diário de Câmera
            </p>
            <h1 className="mt-0.5 text-2xl font-black leading-tight text-zinc-900">
              {titulo}
            </h1>
            <p className="text-sm text-zinc-600">
              {producao.company?.trim() || 'Sem produtora'}
            </p>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-sm sm:text-right">
            <dt className="font-semibold text-zinc-500">Data</dt>
            <dd className="font-semibold">{data}</dd>
            <dt className="font-semibold text-zinc-500">Diária</dt>
            <dd className="font-semibold">{diaria.dayNumber || '—'}</dd>
            <dt className="font-semibold text-zinc-500">Diretor(a)</dt>
            <dd>{producao.director || '—'}</dd>
            <dt className="font-semibold text-zinc-500">Fotografia</dt>
            <dd>{producao.dop || '—'}</dd>
          </dl>
        </div>
      </header>

      {/* ===== Resumo da diária ===== */}
      <section className="mt-4 break-inside-avoid">
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-zinc-700">
          Resumo da diária
        </h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <StatCard label="Câmeras" value={cameras.length} />
          <StatCard label="Cenas" value={agrupadas.length} />
          <StatCard label="Blocos" value={cenas.length} />
          <StatCard label="Planos" value={setups.length} />
          <StatCard label="Takes" value={takes.length} />
          <StatCard label="Aprovados" value={aprovados} />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cameras.length > 0 ? (
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                Câmeras
              </p>
              <ul className="mt-0.5 text-xs text-zinc-700">
                {cameras.map((camera) => (
                  <li key={camera.id}>
                    <span className="font-semibold text-zinc-900">{camera.label}</span>
                    {camera.model ? ` · ${camera.model}` : ''}
                    {camera.bodySerial ? ` · s/n ${camera.bodySerial}` : ''}
                    {camera.operator ? ` · Op: ${camera.operator}` : ''}
                    {camera.focusPuller ? ` · Foco: ${camera.focusPuller}` : ''}
                    {camera.clapper ? ` · Claquete: ${camera.clapper}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
              Cartões usados ({cartoes.length})
            </p>
            {cartoes.length === 0 ? (
              <p className="mt-0.5 text-xs text-zinc-400">—</p>
            ) : (
              <div className="mt-1 flex flex-wrap gap-1">
                {cartoes.map((cartao) => (
                  <span
                    key={cartao}
                    className="rounded border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] text-zinc-800"
                  >
                    {cartao}
                  </span>
                ))}
              </div>
            )}
            {rolls.length > 0 ? (
              <p className="mt-1.5 text-[11px] text-zinc-600">
                <span className="font-semibold text-zinc-500">Rolls: </span>
                {rolls.join(' · ')}
              </p>
            ) : null}
            {/* O equipamento alocado na diária, vindo da sala (Fase 8). Só o de Câmera:
                o boom não interessa a este cabeçalho. */}
            {equipamentos.length > 0 ? (
              <p className="mt-1.5 text-[11px] text-zinc-600">
                <span className="font-semibold text-zinc-500">Equipamento: </span>
                {equipamentos.map((item) => item.descricao).join(' · ')}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* ===== Cenas → Blocos → Planos → Takes ===== */}
      <section className="mt-6">
        {agrupadas.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma cena registrada.</p>
        ) : (
          <div className="space-y-5">
            {agrupadas.map((cena) => {
              const setupsDaCena = cena.blocos.flatMap((bloco) =>
                setups.filter((setup) => setup.sceneId === bloco.id),
              );
              const idsDaCena = new Set(setupsDaCena.map((setup) => setup.id));
              const takesDaCena = takes.filter((take) => idsDaCena.has(take.setupId));
              const aprovadosDaCena = dadosCamera.filter(
                (dado) =>
                  dado.approved && takesDaCena.some((take) => take.id === dado.takeId),
              ).length;

              return (
                <div key={cena.numero} className="pdf-cena">
                  {/* CENA = capítulo */}
                  <div className="pdf-cena-header flex items-center gap-3 rounded-sm bg-zinc-900 px-3 py-2 text-white">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
                      Cena
                    </span>
                    <span className="text-lg font-black leading-none">
                      {cena.numero.trim() || 'S/N'}
                    </span>
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-zinc-400">
                      {cena.blocos.length} blocos · {setupsDaCena.length} planos ·{' '}
                      {aprovadosDaCena} aprov.
                    </span>
                  </div>

                  <div className="mt-2 space-y-3">
                    {cena.blocos.map((bloco) => {
                      const planos = setups
                        .filter((setup) => setup.sceneId === bloco.id)
                        .sort(
                          (a, b) =>
                            a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
                        );

                      return (
                        <div key={bloco.id}>
                          {/* BLOCO = seção */}
                          <div className="pdf-bloco-header flex items-center gap-2 border-b-2 border-zinc-300 pb-1">
                            <span className="rounded bg-zinc-200 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-700">
                              Bloco {bloco.block || '—'}
                            </span>
                            <span className="text-[10px] text-zinc-400">
                              {planos.length} {planos.length === 1 ? 'plano' : 'planos'}
                            </span>
                          </div>

                          <div className="mt-2 space-y-2.5">
                            {agrupaPlanos(planos, assinatura).map((grupo) => {
                              const primeiro = grupo[0];
                              const partes = partesTecnicas(dadosDoPlano(primeiro));
                              const camera = cameraDoSetup(primeiro);
                              const tipo = rotuloDoTipo(primeiro.kind);
                              const rotulo = grupo
                                .map((setup) => `Plano ${setup.code.trim() || 'S/N'}`)
                                .join(' · ');
                              const varios = grupo.length > 1;

                              return (
                                <div key={primeiro.id}>
                                  {/* Setup compartilhado (reduz repetição) */}
                                  <div className="pdf-setup rounded border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[11px] leading-snug">
                                    <span className="font-bold text-zinc-900">
                                      {rotulo}
                                    </span>
                                    {camera || tipo || partes.length > 0 ? (
                                      <span className="text-zinc-600">
                                        {' — '}
                                        {[camera?.label, tipo, ...partes]
                                          .filter(Boolean)
                                          .join(' · ')}
                                      </span>
                                    ) : null}
                                  </div>

                                  {grupo.map((setup) => {
                                    const takesDoPlano = takesDoSetup(setup.id);
                                    const referencia = dadosDoPlano(setup);
                                    const nomeCamera = cameraDoSetup(setup)?.label ?? '—';

                                    return (
                                      <div key={setup.id} className="pdf-plano mt-1.5">
                                        {varios ? (
                                          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                                            Plano {setup.code.trim() || 'S/N'}
                                          </p>
                                        ) : null}

                                        {takesDoPlano.length === 0 ? (
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
                                                <th className="px-1.5 py-1 font-bold">
                                                  #
                                                </th>
                                                <th className="px-1.5 py-1 font-bold">
                                                  Cam
                                                </th>
                                                <th className="px-1.5 py-1 font-bold">
                                                  Cartão
                                                </th>
                                                <th className="px-1.5 py-1 font-bold">
                                                  Clip/Sync
                                                </th>
                                                <th className="px-1.5 py-1 font-bold">
                                                  Nota
                                                </th>
                                                <th className="px-1.5 py-1 font-bold">
                                                  Status
                                                </th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {takesDoPlano.map((take) => {
                                                const dados = dadosDoTake(setup, take);
                                                const aprovado = dados?.approved ?? false;
                                                const julgamento = rotuloDoJulgamento(
                                                  dados?.status,
                                                );
                                                const mudou = diferencasDoPlano(
                                                  dados,
                                                  referencia,
                                                );

                                                return (
                                                  <tr
                                                    key={take.id}
                                                    className={cn(
                                                      'border-b border-zinc-200 align-top',
                                                      aprovado && 'bg-approved-soft/50',
                                                    )}
                                                  >
                                                    <td
                                                      className={cn(
                                                        'px-1.5 py-1 font-mono font-bold',
                                                        aprovado &&
                                                          'border-l-[3px] border-approved',
                                                      )}
                                                    >
                                                      {take.number}
                                                    </td>
                                                    <td className="px-1.5 py-1">
                                                      {nomeCamera}
                                                    </td>
                                                    <td className="px-1.5 py-1 font-mono">
                                                      {dados?.card || '—'}
                                                    </td>
                                                    <td className="px-1.5 py-1 font-mono">
                                                      {dados?.fileName || '—'}
                                                    </td>
                                                    <td
                                                      className={cn(
                                                        'break-words px-1.5 py-1',
                                                        aprovado &&
                                                          'font-semibold text-zinc-900',
                                                      )}
                                                    >
                                                      {dados?.notes || take.notes || '—'}
                                                      {/* Zinc-700 e não 500: esta linha
                                                          cai sobre a faixa verde do take
                                                          aprovado, onde cinza claro
                                                          desaparece no papel. */}
                                                      {mudou.length > 0 ? (
                                                        <span className="block text-[10px] font-normal italic text-zinc-700">
                                                          {mudou.join(' · ')}
                                                        </span>
                                                      ) : null}
                                                      {dados?.mediaNotes ? (
                                                        <span className="block text-[10px] font-normal text-zinc-600">
                                                          Mídia: {dados.mediaNotes}
                                                        </span>
                                                      ) : null}
                                                    </td>
                                                    <td className="px-1.5 py-1">
                                                      {aprovado ? (
                                                        <span className="inline-block rounded bg-approved px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                                                          ✓ Aprovado
                                                        </span>
                                                      ) : null}
                                                      {/* O julgamento da câmera é outro
                                                          eixo (ADR-010): um take pode ser
                                                          aprovado pelo diretor e NG para
                                                          a câmera, e a pós precisa saber. */}
                                                      {julgamento ? (
                                                        <span
                                                          className={cn(
                                                            'inline-block rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                                                            aprovado ? 'ml-1' : '',
                                                            'border-zinc-400 text-zinc-700',
                                                          )}
                                                        >
                                                          {julgamento}
                                                        </span>
                                                      ) : null}
                                                      {!aprovado && !julgamento ? (
                                                        <span className="text-zinc-300">
                                                          —
                                                        </span>
                                                      ) : null}
                                                    </td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        )}

                                        {setup.description?.trim() ? (
                                          <p className="mt-1 text-[11px] text-zinc-700">
                                            <span className="font-semibold text-zinc-500">
                                              Obs.:{' '}
                                            </span>
                                            {setup.description}
                                          </p>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ===== Horários / Equipe ===== */}
      <section className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="break-inside-avoid">
          <Titulo>Horários</Titulo>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Info label="Call" value={hora(diaria.callTime)} />
            <Info label="Wrap" value={hora(diaria.wrapTime)} />
            <Info label="Almoço" value={almoco} />
            <Info label="Locação" value={diaria.location ?? ''} />
            <Info label="Unidade" value={diaria.unit ?? ''} />
          </dl>
        </div>

        {equipe.length > 0 ? (
          <div className="break-inside-avoid">
            <Titulo>Equipe de câmera</Titulo>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1">
              {equipe.map((membro) => (
                <li
                  key={membro.id}
                  className="flex justify-between gap-3 border-b border-zinc-100 py-0.5 text-[11px]"
                >
                  <span className="font-medium text-zinc-900">{membro.nome || '—'}</span>
                  <span className="text-zinc-500">{membro.funcao || '—'}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {diaria.notes?.trim() ? (
        <section className="mt-5 break-inside-avoid">
          <Titulo>Observações gerais</Titulo>
          <p className="whitespace-pre-wrap text-[11px] text-zinc-800">{diaria.notes}</p>
        </section>
      ) : null}

      {/* ===== Footer próprio ===== */}
      <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t-2 border-zinc-900 pt-2 text-[10px] text-zinc-500">
        <span className="font-bold uppercase tracking-wide text-zinc-700">
          Boletim Diário de Câmera
        </span>
        <span className="truncate">
          {titulo} · {data}
          {diaria.dayNumber ? ` · Diária ${diaria.dayNumber}` : ''}
        </span>
        <span>Gerado em {formatDateTimeBR(new Date().toISOString())}</span>
      </footer>
    </article>
  );
}

/**
 * Planos consecutivos com a mesma câmera e a mesma técnica saem como um bloco só.
 *
 * `groupPlanos` do boletim atual. O código do plano **não** entra na assinatura — se
 * entrasse, nenhum plano jamais agruparia com o seguinte.
 */
function agrupaPlanos(
  planos: LocalSetup[],
  assinatura: (plano: LocalSetup) => string,
): LocalSetup[][] {
  const grupos: { assinatura: string; planos: LocalSetup[] }[] = [];

  for (const plano of planos) {
    const atual = assinatura(plano);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.assinatura === atual) ultimo.planos.push(plano);
    else grupos.push({ assinatura: atual, planos: [plano] });
  }

  return grupos.map((grupo) => grupo.planos);
}
