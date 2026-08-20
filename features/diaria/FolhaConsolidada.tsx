'use client';

import type { CabecalhoImpressao } from '@/features/camera/FolhaCamera';
import { cn } from '@/utils/cn';

import type { ColunaDoTake, LinhaConsolidada } from './consolidado';
import type { LacunasDoDia } from './consolidado';

/**
 * A folha A4 da diária consolidada — o relatório que a Fase 9 pedia "por cena/setup/take".
 *
 * As três folhas de departamento existem desde as Fases 5–7 e cada uma responde por um
 * caderno. Esta responde por uma pergunta que **nenhuma delas pode responder sozinha**:
 * o que este dia produziu, take a take, com os três departamentos na mesma linha. É a
 * folha que vai para a produção e para a montagem — quem recebe as três separadas ainda
 * tem de casá-las à mão, que é justamente o trabalho que o `take_id` compartilhado acabou.
 *
 * Sem `fetch` e sem consulta: tudo chega por props, já lido pela tela (ADR-016). Imprimir
 * no fim da diária funciona em modo avião, como nas outras três.
 */

export interface FolhaConsolidadaProps {
  cabecalho: CabecalhoImpressao;
  linhas: LinhaConsolidada[];
  lacunas: LacunasDoDia;
}

const hora = (valor: string | null | undefined) => valor?.slice(0, 5) ?? '';

/** `2026-08-19` → `19/08/2026`. Sem `Date`: a diária é dia civil, não instante (R9). */
function dataBR(date: string): string {
  const [ano, mes, dia] = date.split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : date || '—';
}

function StatCard({
  label,
  value,
  alerta,
}: {
  label: string;
  value: number | string;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-center">
      <div
        className={cn(
          'text-lg font-bold leading-none text-zinc-900',
          alerta && value !== 0 && 'text-zinc-900 underline decoration-2',
        )}
      >
        {value}
      </div>
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

/**
 * A célula de um departamento dentro da linha do take.
 *
 * Um departamento que **não anotou** imprime um traço, e não uma célula em branco: em
 * branco lê-se como "não sei", e o traço diz "ninguém registrou" — que é a informação que
 * a produção veio buscar.
 */
function Celula({ rotulo, coluna }: { rotulo: string; coluna: ColunaDoTake }) {
  const partes = [coluna.arquivo, coluna.midia, coluna.julgamento].filter(Boolean);

  return (
    <div className="min-w-0 border-l border-zinc-200 pl-2">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
        {rotulo}
        {coluna.destaque ? <span className="ml-1 text-zinc-900">●</span> : null}
      </p>
      {!coluna.anotou ? (
        <p className="text-xs text-zinc-400">—</p>
      ) : (
        <>
          <p className="break-words text-xs text-zinc-900">{partes.join(' · ') || '—'}</p>
          {coluna.nota ? (
            <p className="mt-0.5 break-words text-[11px] italic text-zinc-600">
              {coluna.nota}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

export function FolhaConsolidada({ cabecalho, linhas, lacunas }: FolhaConsolidadaProps) {
  const { producao, diaria, equipe } = cabecalho;

  const titulo = producao.name.trim() || 'Sem título';
  const almoco =
    hora(diaria.lunchStart) || hora(diaria.lunchEnd)
      ? `${hora(diaria.lunchStart) || '—'} – ${hora(diaria.lunchEnd) || '—'}`
      : '';

  /** Cena → plano, na ordem em que o dia foi rodado; a linha já vem ordenada. */
  const cenas: {
    chave: string;
    cena: string;
    bloco: string;
    linhas: LinhaConsolidada[];
  }[] = [];

  for (const linha of linhas) {
    const chave = `${linha.cena}|${linha.bloco}`;
    const atual = cenas[cenas.length - 1];
    if (atual && atual.chave === chave) atual.linhas.push(linha);
    else cenas.push({ chave, cena: linha.cena, bloco: linha.bloco, linhas: [linha] });
  }

  return (
    <article className="print-sheet mx-auto w-full max-w-[820px] rounded-none bg-white p-6 text-zinc-900 shadow-2xl sm:rounded-xl sm:p-9">
      {/* ===== Cabeçalho ===== */}
      <header className="border-b-2 border-zinc-900 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 border-l-4 border-brand pl-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-zinc-500">
              Diária consolidada
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
            <dd className="font-semibold">{dataBR(diaria.date)}</dd>
            <dt className="font-semibold text-zinc-500">Diária</dt>
            <dd className="font-semibold">{diaria.dayNumber || '—'}</dd>
            <dt className="font-semibold text-zinc-500">Diretor(a)</dt>
            <dd>{producao.director || '—'}</dd>
            <dt className="font-semibold text-zinc-500">Fotografia</dt>
            <dd>{producao.dop || '—'}</dd>
          </dl>
        </div>
      </header>

      {/* ===== Resumo e lacunas ===== */}
      <section className="mt-4 break-inside-avoid">
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-zinc-700">
          O dia em números
        </h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <StatCard label="Cenas" value={new Set(linhas.map((l) => l.cena)).size} />
          <StatCard label="Takes" value={linhas.length} />
          <StatCard
            label="Aprovados"
            value={linhas.filter((l) => l.camera.destaque).length}
          />
          {/* MOS não entra como lacuna: é take rodado sem áudio de propósito (ADR-029). */}
          <StatCard label="Sem som" value={lacunas.semSom} alerta />
          <StatCard label="Sem câmera" value={lacunas.semCamera} alerta />
          <StatCard label="Sem contin." value={lacunas.semContinuidade} />
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Info label="Call" value={hora(diaria.callTime)} />
          <Info label="Wrap" value={hora(diaria.wrapTime)} />
          <Info label="Almoço" value={almoco} />
          <Info label="Locação" value={diaria.location ?? ''} />
        </dl>

        {equipe.length > 0 ? (
          <p className="mt-2 text-[11px] text-zinc-600">
            <span className="font-semibold text-zinc-500">Equipe: </span>
            {equipe.map((pessoa) => `${pessoa.nome} (${pessoa.funcao})`).join(' · ')}
          </p>
        ) : null}
      </section>

      {/* ===== Take a take, os três departamentos ===== */}
      <section className="mt-6">
        {linhas.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum take registrado nesta diária.</p>
        ) : (
          <div className="space-y-4">
            {cenas.map((grupo) => (
              <div key={grupo.chave} className="pdf-cena">
                <div className="pdf-cena-header flex items-center gap-3 rounded-sm bg-zinc-900 px-3 py-2 text-white">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
                    Cena
                  </span>
                  <span className="text-lg font-black leading-none">
                    {grupo.cena || 'S/N'}
                    {grupo.bloco ? (
                      <span className="ml-1 text-sm font-bold">{grupo.bloco}</span>
                    ) : null}
                  </span>
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-zinc-400">
                    {grupo.linhas.length} {grupo.linhas.length === 1 ? 'take' : 'takes'}
                  </span>
                </div>

                <div className="mt-2 divide-y divide-zinc-200 border-b border-zinc-200">
                  {grupo.linhas.map((linha) => (
                    <div key={linha.takeId} className="break-inside-avoid py-1.5">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                          Plano {linha.plano || '—'}
                        </span>
                        <span className="text-sm font-bold text-zinc-900">
                          Take {linha.take}
                        </span>
                        {linha.natureza ? (
                          <span className="rounded border border-zinc-300 px-1 text-[10px] uppercase text-zinc-600">
                            {linha.natureza}
                          </span>
                        ) : null}
                        {linha.mos ? (
                          <span className="rounded border border-zinc-400 px-1 text-[10px] font-bold uppercase text-zinc-700">
                            MOS
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <Celula rotulo="Câmera" coluna={linha.camera} />
                        <Celula rotulo="Som" coluna={linha.som} />
                        <Celula rotulo="Continuidade" coluna={linha.continuidade} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="mt-6 border-t border-zinc-300 pt-2 text-[10px] text-zinc-500">
        Relacionado por <code>take_id</code> — um take, três departamentos, sem
        conciliação. ● marca o take destacado por aquele departamento.
      </footer>
    </article>
  );
}
