'use client';

import type { LocalSoundDayConfig } from '@/lib/offline/db';
import { cn } from '@/utils/cn';

import type { CabecalhoImpressao } from '@/features/camera/FolhaCamera';

import { resumoDeTracks, resumoDoDia, type LinhaSom } from './estrutura';

/**
 * A folha A4 do Boletim de Som — HTML + CSS de impressão, sem biblioteca de PDF.
 *
 * As mesmas classes de `globals.css` que a folha da Câmera usa (`print-sheet`,
 * `pdf-table`), e a mesma regra: **nenhum `fetch` e nenhuma consulta**. Tudo chega por
 * props, já lido pela tela — é o que garante imprimir com o aparelho em modo avião, que é
 * quando o boletim costuma ser fechado.
 *
 * O corpo é **uma linha por arquivo**, e não a hierarquia da tela: o sound report é lido
 * pela pós procurando um arquivo específico, não navegando a diária (sound.md §6).
 */

const hora = (valor: string | null | undefined) => valor?.slice(0, 5) ?? '';

/** `2026-08-11` → `11/08/2026`. Sem `Date`: a diária é dia civil, não instante (R9). */
function dataBR(date: string): string {
  const [ano, mes, dia] = date.split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : date || '—';
}

function horaDoJam(valor: string | null | undefined): string {
  if (!valor) return '';
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? ''
    : data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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

export interface FolhaSomProps {
  cabecalho: CabecalhoImpressao;
  config?: LocalSoundDayConfig;
  linhas: LinhaSom[];
}

export function FolhaSom({ cabecalho, config, linhas }: FolhaSomProps) {
  const { producao, diaria, equipe } = cabecalho;
  const resumo = resumoDoDia(linhas);

  /** Só o equipamento de Som: o boom não interessa ao cabeçalho da câmera, nem o contrário. */
  const equipamentos = (cabecalho.equipamentos ?? []).filter(
    (item) => item.departamento === 'SOUND',
  );

  const titulo = producao.name.trim() || 'Sem título';

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
              Boletim Diário de Som
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
            <dt className="font-semibold text-zinc-500">Sound mixer</dt>
            <dd>{config?.soundMixer || '—'}</dd>
            <dt className="font-semibold text-zinc-500">Boom</dt>
            <dd>{config?.boomOperator || '—'}</dd>
          </dl>
        </div>
      </header>

      {/* ===== Resumo da diária ===== */}
      <section className="mt-4 break-inside-avoid">
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-zinc-700">
          Resumo da diária
        </h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <StatCard label="Takes" value={resumo.takes} />
          <StatCard label="Com som" value={resumo.comSom} />
          <StatCard label="Circled" value={resumo.circled} />
          <StatCard label="MOS" value={resumo.mos} />
          <StatCard label="NG" value={resumo.ng} />
          <StatCard label="Arquivos" value={resumo.arquivos} />
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <Info label="Locação" value={diaria.location ?? ''} />
          <Info label="Unidade" value={diaria.unit ?? ''} />
          <Info label="Call" value={hora(diaria.callTime)} />
          <Info label="Almoço" value={almoco} />
          <Info label="Sample rate" value={config?.sampleRate ?? ''} />
          <Info label="Bit depth" value={config?.bitDepth ?? ''} />
          <Info label="Frame rate" value={config?.frameRate ?? ''} />
          <Info label="Formato" value={formatoDoDia(config)} />
          <Info label="Fonte de TC" value={config?.timecodeSource ?? ''} />
          <Info label="Jam" value={horaDoJam(config?.tcJamAt)} />
          <Info label="User bits" value={config?.userBits ?? ''} />
          <Info label="Drop frame" value={config?.dropFrame ? 'Sim' : 'Não'} />
        </dl>

        {/* A custódia é o que o sound report existe para responder: o arquivo chegou
            inteiro do outro lado? Imprimir "cópias conferidas" fecha a pergunta. */}
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          <Info label="Mídia" value={config?.media ?? ''} />
          <Info label="Cópias" value={config?.mediaCopies ?? ''} />
          <Info label="Cópias conferidas" value={config?.mediaVerified ? 'Sim' : 'Não'} />
        </dl>

        {/* Os modelos do dia impressos no cabeçalho — a lacuna que o levantamento de
            `2026-08-10` marcou como pendente até o catálogo existir (sound.md §5). O
            sound report é cadeia de custódia: "gravado como" inclui com quê. */}
        {equipamentos.length > 0 ? (
          <p className="mt-2 text-[11px] text-zinc-600">
            <span className="font-semibold text-zinc-500">Equipamento: </span>
            {equipamentos.map((item) => item.descricao).join(' · ')}
          </p>
        ) : null}

        {resumo.rolls.length > 0 ? (
          <p className="mt-2 text-[11px] text-zinc-600">
            <span className="font-semibold text-zinc-500">Rolls: </span>
            {resumo.rolls.join(' · ')}
          </p>
        ) : null}

        {equipe.length > 0 ? (
          <p className="mt-1.5 text-[11px] text-zinc-600">
            <span className="font-semibold text-zinc-500">Equipe: </span>
            {equipe.map((pessoa) => `${pessoa.nome} (${pessoa.funcao})`).join(' · ')}
          </p>
        ) : null}
      </section>

      {/* ===== Uma linha por arquivo ===== */}
      <section className="mt-6">
        <h2 className="mb-2 border-b border-zinc-300 pb-1 text-[11px] font-bold uppercase tracking-widest text-zinc-700">
          Takes
        </h2>

        {linhas.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum take registrado.</p>
        ) : (
          <table className="pdf-table w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-zinc-400 text-left">
                <Th>Cena</Th>
                <Th>Plano</Th>
                <Th className="text-right">Take</Th>
                <Th>Natureza</Th>
                <Th>Roll</Th>
                <Th>Arquivo</Th>
                <Th>TC in</Th>
                <Th>TC out</Th>
                <Th>Canais</Th>
                <Th>Observações</Th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => (
                <tr
                  key={linha.takeId}
                  className={cn(
                    'border-b border-zinc-200 align-top',
                    linha.circled && 'bg-zinc-100 font-semibold',
                  )}
                >
                  <Td>
                    {linha.cena}
                    {linha.bloco ? linha.bloco : ''}
                  </Td>
                  <Td>{linha.plano}</Td>
                  <Td className="text-right font-mono">{linha.take}</Td>
                  <Td>
                    {/* MOS em destaque: é a linha que alguém abre o relatório para achar. */}
                    <span className={cn(linha.mos && 'font-bold')}>
                      {linha.natureza ?? ''}
                    </span>
                    {linha.julgamento ? (
                      <span className="text-zinc-500">
                        {linha.natureza ? ' · ' : ''}
                        {linha.julgamento}
                      </span>
                    ) : null}
                    {linha.circled ? (
                      <span className="text-zinc-500">
                        {linha.natureza || linha.julgamento ? ' · ' : ''}circled
                      </span>
                    ) : null}
                  </Td>
                  <Td className="font-mono">{linha.roll}</Td>
                  <Td className="font-mono">{linha.arquivo}</Td>
                  <Td className="font-mono">{linha.tcInicio}</Td>
                  <Td className="font-mono">{linha.tcFim}</Td>
                  <Td>{resumoDeTracks(linha.tracks)}</Td>
                  <Td>
                    {[linha.motivoNG ? `NG: ${linha.motivoNG}` : '', linha.nota]
                      .filter(Boolean)
                      .join(' · ')}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {diaria.notes ? (
        <section className="mt-5 break-inside-avoid">
          <h2 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-zinc-700">
            Observações da diária
          </h2>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-700">
            {diaria.notes}
          </p>
        </section>
      ) : null}

      <footer className="mt-6 border-t border-zinc-300 pt-2 text-[9px] text-zinc-500">
        Boletim Audiovisual · Som · {dataBR(diaria.date)}
      </footer>
    </article>
  );
}

function formatoDoDia(config?: LocalSoundDayConfig): string {
  return [
    config?.fileFormat,
    config?.poly === null || config?.poly === undefined
      ? ''
      : config.poly
        ? 'poly'
        : 'mono',
  ]
    .filter(Boolean)
    .join(' · ');
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'px-1.5 py-1 text-[9px] font-bold uppercase tracking-wide text-zinc-500',
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-1.5 py-1 text-zinc-800', className)}>{children}</td>;
}
