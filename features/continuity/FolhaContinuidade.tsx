'use client';

import type { LocalDailyProgressReport } from '@/lib/offline/db';
import { cn } from '@/utils/cn';

import type { CabecalhoImpressao } from '@/features/camera/FolhaCamera';

import { paginasComRessalva } from './RelatorioProgresso';
import type { ContagensDoDia, LinhaContinuidade } from './estrutura';

/**
 * As duas folhas A4 da Continuidade — mesmo mecanismo de impressão dos outros módulos.
 *
 * São **dois documentos diferentes** na mesma sobreposição, e não um só com duas seções:
 * o boletim de continuidade vai para a montagem e o relatório de progresso vai para a
 * produção. Quem imprime escolhe, e cada um começa em página nova.
 *
 * Nenhum `fetch` e nenhuma consulta: tudo chega por props, já lido pela tela.
 */

const dataBR = (date: string) => {
  const [ano, mes, dia] = date.split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : date || '—';
};

const hora = (valor: string | null | undefined) => valor?.slice(0, 5) ?? '';

export type DocumentoImpresso = 'CONTINUIDADE' | 'PROGRESSO';

export interface FolhaContinuidadeProps {
  documento: DocumentoImpresso;
  cabecalho: CabecalhoImpressao;
  linhas: LinhaContinuidade[];
  contagens: ContagensDoDia;
  relatorio?: LocalDailyProgressReport;
}

export function FolhaContinuidade(props: FolhaContinuidadeProps) {
  return props.documento === 'PROGRESSO' ? (
    <FolhaProgresso {...props} />
  ) : (
    <FolhaDeCenas {...props} />
  );
}

function Cabecalho({
  cabecalho,
  titulo,
}: {
  cabecalho: CabecalhoImpressao;
  titulo: string;
}) {
  const { producao, diaria } = cabecalho;

  return (
    <header className="border-b-2 border-zinc-900 pb-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 border-l-4 border-brand pl-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-zinc-500">
            {titulo}
          </p>
          <h1 className="mt-0.5 text-2xl font-black leading-tight text-zinc-900">
            {producao.name.trim() || 'Sem título'}
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
          <dt className="font-semibold text-zinc-500">Direção</dt>
          <dd>{producao.director || '—'}</dd>
          <dt className="font-semibold text-zinc-500">Locação</dt>
          <dd>{diaria.location || '—'}</dd>
        </dl>
      </div>
    </header>
  );
}

/** O boletim de continuidade: por cena, com os takes e as notas de ação (§8). */
function FolhaDeCenas({ cabecalho, linhas }: FolhaContinuidadeProps) {
  const porCena = new Map<string, LinhaContinuidade[]>();
  for (const linha of linhas) {
    const chave = `${linha.cena}|${linha.bloco}`;
    porCena.set(chave, [...(porCena.get(chave) ?? []), linha]);
  }

  return (
    <article className="print-sheet mx-auto w-full max-w-[820px] rounded-none bg-white p-6 text-zinc-900 shadow-2xl sm:rounded-xl sm:p-9">
      <Cabecalho cabecalho={cabecalho} titulo="Boletim de Continuidade" />

      {linhas.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">Nenhum take registrado.</p>
      ) : (
        <div className="mt-5 space-y-5">
          {[...porCena.entries()].map(([chave, daCena]) => {
            const [numero, bloco] = chave.split('|');

            return (
              <section key={chave} className="pdf-cena">
                <div className="pdf-cena-header flex items-center gap-3 rounded-sm bg-zinc-900 px-3 py-2 text-white">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
                    Cena
                  </span>
                  <span className="text-lg font-black leading-none">
                    {numero}
                    {bloco}
                  </span>
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-zinc-400">
                    {daCena.length} takes · {daCena.filter((l) => l.print).length} print
                  </span>
                </div>

                <div className="mt-2 space-y-2">
                  {daCena.map((linha) => (
                    <div
                      key={linha.takeId}
                      className={cn(
                        'pdf-plano rounded border px-2.5 py-2 text-[11px] leading-snug',
                        linha.print
                          ? 'border-zinc-400 bg-zinc-100'
                          : 'border-zinc-200 bg-white',
                      )}
                    >
                      <div className="flex flex-wrap items-baseline gap-x-3">
                        <span className="font-bold text-zinc-900">
                          Plano {linha.plano} · Take {linha.take}
                        </span>
                        {linha.veredito ? (
                          <span className="font-semibold text-zinc-700">
                            {linha.veredito}
                            {linha.motivoNG ? `: ${linha.motivoNG}` : ''}
                          </span>
                        ) : null}
                        {linha.duracao ? (
                          <span className="font-mono text-zinc-600">{linha.duracao}</span>
                        ) : null}
                        <span className="ml-auto font-mono text-[10px] text-zinc-500">
                          {[linha.tecnica, linha.som].filter(Boolean).join('  ·  ')}
                        </span>
                      </div>

                      {linha.nota ? (
                        <p className="mt-1 text-zinc-800">{linha.nota}</p>
                      ) : null}

                      {linha.acao.length > 0 ? (
                        <dl className="mt-1 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                          {linha.acao.map((campo) => (
                            <div key={campo.rotulo} className="flex gap-1.5">
                              <dt className="shrink-0 font-semibold text-zinc-500">
                                {campo.rotulo}:
                              </dt>
                              <dd className="min-w-0 text-zinc-800">{campo.valor}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <footer className="mt-6 border-t border-zinc-300 pt-2 text-[9px] text-zinc-500">
        Boletim Audiovisual · Continuidade · {dataBR(cabecalho.diaria.date)}
      </footer>
    </article>
  );
}

/**
 * O Relatório de Progresso da Diária (§7).
 *
 * O balanço que a produção consome. Metade dele é contagem — e a contagem vem da diária,
 * não de alguém somando três cadernos no fim do dia.
 */
function FolhaProgresso({ cabecalho, contagens, relatorio }: FolhaContinuidadeProps) {
  const { diaria } = cabecalho;

  return (
    <article className="print-sheet mx-auto w-full max-w-[820px] rounded-none bg-white p-6 text-zinc-900 shadow-2xl sm:rounded-xl sm:p-9">
      <Cabecalho cabecalho={cabecalho} titulo="Relatório de Progresso da Diária" />

      <section className="mt-4 break-inside-avoid">
        <Titulo>Horários</Titulo>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          <Info rotulo="Call" valor={hora(diaria.callTime)} />
          <Info rotulo="1º take" valor={relatorio?.firstTakeAt?.slice(0, 5) ?? ''} />
          <Info rotulo="Almoço" valor={hora(diaria.lunchStart)} />
          <Info rotulo="Retorno" valor={hora(diaria.lunchEnd)} />
          <Info rotulo="Wrap" valor={hora(diaria.wrapTime)} />
        </dl>
      </section>

      <section className="mt-4 break-inside-avoid">
        <Titulo>Contagens</Titulo>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <Numero rotulo="Cenas" valor={contagens.cenas} />
          <Numero rotulo="Planos" valor={contagens.planos} />
          <Numero rotulo="Takes" valor={contagens.takes} />
          <Numero rotulo="Prints" valor={contagens.prints} />
          <Numero rotulo="Páginas" valor={paginasComRessalva(contagens)} />
          <Numero rotulo="Minutagem" valor={relatorio?.estimatedMinutes || '—'} />
        </div>
        {relatorio?.pagesShot ? (
          <p className="mt-2 text-xs text-zinc-600">
            <span className="font-semibold text-zinc-500">Páginas rodadas: </span>
            {relatorio.pagesShot}
            <span className="text-zinc-400">
              {' '}
              (do roteiro previsto para as cenas do dia: {contagens.paginas.formatado})
            </span>
          </p>
        ) : null}
        {contagens.duracao ? (
          <p className="mt-1 text-xs text-zinc-600">
            <span className="font-semibold text-zinc-500">Material cronometrado: </span>
            {contagens.duracao}
          </p>
        ) : null}
      </section>

      <section className="mt-4 break-inside-avoid">
        <Titulo>Cobertura</Titulo>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Info
            rotulo="Cobertas"
            valor={relatorio?.scenesCovered || contagens.cenasRodadas.join(', ')}
          />
          <Info rotulo="Parciais" valor={relatorio?.scenesPartial ?? ''} />
          <Info rotulo="Puladas" valor={relatorio?.scenesSkipped ?? ''} />
          <Info rotulo="Acrescentadas" valor={relatorio?.scenesAdded ?? ''} />
        </dl>
      </section>

      <section className="mt-4 break-inside-avoid">
        <Titulo>Mídia</Titulo>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Info rotulo="Cartões de câmera" valor={contagens.cartoes.join(' · ')} />
          <Info rotulo="Rolls de som" valor={contagens.rolls.join(' · ')} />
        </dl>
      </section>

      {relatorio?.notes || diaria.notes ? (
        <section className="mt-4 break-inside-avoid">
          <Titulo>Observações</Titulo>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-700">
            {[relatorio?.notes, diaria.notes].filter(Boolean).join('\n\n')}
          </p>
        </section>
      ) : null}

      <section className="mt-8 break-inside-avoid">
        <div className="ml-auto w-64 border-t border-zinc-400 pt-1 text-center text-[10px] text-zinc-600">
          {relatorio?.signedBy || ' '}
          <div className="text-[9px] text-zinc-400">Continuidade</div>
        </div>
      </section>

      <footer className="mt-6 border-t border-zinc-300 pt-2 text-[9px] text-zinc-500">
        Boletim Audiovisual · Progresso da diária · {dataBR(diaria.date)}
      </footer>
    </article>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 border-b border-zinc-300 pb-1 text-[11px] font-bold uppercase tracking-widest text-zinc-700">
      {children}
    </h2>
  );
}

function Info({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
        {rotulo}
      </dt>
      <dd className="text-sm text-zinc-900">{valor.trim() || '—'}</dd>
    </div>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number | string }) {
  return (
    <div className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-center">
      <div className="text-lg font-bold leading-none text-zinc-900">{valor}</div>
      <div className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
        {rotulo}
      </div>
    </div>
  );
}
