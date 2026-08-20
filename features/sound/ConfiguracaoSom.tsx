'use client';

import { SectionCard } from '@/components/layout/SectionCard';
import { Button } from '@/components/ui/Button';
import { DebouncedTextField } from '@/components/ui/DebouncedTextField';
import { Toggle } from '@/components/ui/Toggle';
import { ClockIcon, HardDriveIcon, UsersIcon } from '@/components/ui/icons';
import type { LocalSoundDayConfig } from '@/lib/offline/db';
import { ensureSoundDayConfig, patchSoundDayConfig } from '@/lib/offline/repos/som';
import { syncNow } from '@/lib/sync/engine';

/**
 * Presets de digitação, não listas fechadas.
 *
 * Mesma regra do boletim: todo campo é texto livre e o `<datalist>` só acelera. Um seletor
 * fechado erra na primeira diária que usa um gravador fora da lista, e em set não há como
 * pedir uma atualização do app.
 */
const SAMPLE_RATES = ['48 kHz', '48.048 kHz', '96 kHz', '192 kHz'] as const;
const BIT_DEPTHS = ['16 bits', '24 bits', '32 bits float'] as const;
const FRAME_RATES = ['23.976', '24', '25', '29.97', '30'] as const;
const FONTES_TC = [
  'Interno do gravador',
  'Lockit',
  'Tentacle',
  'Câmera',
  'Jam diário',
] as const;
const FORMATOS = ['WAV', 'BWF', 'MP3 (referência)'] as const;

/** `2026-08-11T14:32:00.000Z` → `11:32`, no fuso de quem está lendo. */
function horaDoJam(valor: string | null | undefined): string {
  if (!valor) return '';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * A configuração de som da diária — o que vale para o dia inteiro, não por take.
 *
 * Está **dentro** da fronteira offline de propósito: sample rate, timecode e roll são
 * decididos e corrigidos em set, com o gravador na mão. Deixá-los do lado do servidor
 * faria a primeira coisa que o Som faz no dia exigir sinal (ADR-016).
 *
 * O registro nasce no primeiro toque, não ao abrir a tela: quem só veio consultar a diária
 * não devia enfileirar uma configuração vazia para sincronizar.
 */
export function ConfiguracaoSom({
  productionId,
  shootingDayId,
  config,
  canEdit,
}: {
  productionId: string;
  shootingDayId: string;
  config?: LocalSoundDayConfig;
  canEdit: boolean;
}) {
  async function altera(changes: Record<string, unknown>) {
    const id = await ensureSoundDayConfig({ productionId, shootingDayId });
    await patchSoundDayConfig(id, changes);
    syncNow();
  }

  const resumo = [
    config?.sampleRate,
    config?.bitDepth,
    config?.frameRate ? `${config.frameRate} fps` : null,
    config?.roll ? `Roll ${config.roll}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <SectionCard
        title="Equipe de som"
        icon={<UsersIcon size={18} />}
        collapsible
        defaultOpen={false}
        summary={
          [config?.soundMixer, config?.boomOperator].filter(Boolean).join(' · ') ||
          'Não preenchida'
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <DebouncedTextField
            label="Sound mixer"
            value={config?.soundMixer ?? ''}
            disabled={!canEdit}
            onCommit={(valor) => void altera({ soundMixer: valor || null })}
          />
          <DebouncedTextField
            label="Boom operator"
            value={config?.boomOperator ?? ''}
            disabled={!canEdit}
            onCommit={(valor) => void altera({ boomOperator: valor || null })}
          />
        </div>
        <p className="mt-3 text-xs text-zinc-400">
          O resto da equipe vem da sala. Aqui ficam só os dois nomes que o sound report
          imprime no cabeçalho.
        </p>
      </SectionCard>

      <SectionCard
        title="Configuração do dia"
        icon={<ClockIcon size={18} />}
        collapsible
        defaultOpen={false}
        summary={resumo || 'Não preenchida'}
      >
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <DebouncedTextField
              label="Sample rate"
              value={config?.sampleRate ?? ''}
              disabled={!canEdit}
              options={SAMPLE_RATES}
              placeholder="48 kHz"
              onCommit={(valor) => void altera({ sampleRate: valor || null })}
            />
            <DebouncedTextField
              label="Bit depth"
              value={config?.bitDepth ?? ''}
              disabled={!canEdit}
              options={BIT_DEPTHS}
              placeholder="24 bits"
              onCommit={(valor) => void altera({ bitDepth: valor || null })}
            />
            <DebouncedTextField
              label="Frame rate"
              value={config?.frameRate ?? ''}
              disabled={!canEdit}
              options={FRAME_RATES}
              placeholder="24"
              onCommit={(valor) => void altera({ frameRate: valor || null })}
            />
            <DebouncedTextField
              label="Formato"
              value={config?.fileFormat ?? ''}
              disabled={!canEdit}
              options={FORMATOS}
              placeholder="WAV"
              onCommit={(valor) => void altera({ fileFormat: valor || null })}
            />
          </div>

          <Toggle
            label="Poly"
            description={
              config?.poly
                ? 'Um arquivo com todos os canais'
                : 'Mono: um arquivo por canal'
            }
            checked={config?.poly ?? false}
            onChange={(valor) => void altera({ poly: valor })}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <DebouncedTextField
              label="Mídia"
              value={config?.media ?? ''}
              disabled={!canEdit}
              placeholder="SD 128 GB"
              onCommit={(valor) => void altera({ media: valor || null })}
            />
            <DebouncedTextField
              label="Roll do dia"
              value={config?.roll ?? ''}
              disabled={!canEdit}
              placeholder="004"
              onCommit={(valor) => void altera({ roll: valor || null })}
            />
          </div>
          <p className="text-xs text-zinc-400">
            O roll do dia é o ponto de partida do primeiro take de cada plano. Trocá-lo no
            meio da diária não reescreve o que já foi anotado.
          </p>
        </div>
      </SectionCard>

      <SectionCard
        title="Timecode e custódia"
        icon={<HardDriveIcon size={18} />}
        collapsible
        defaultOpen={false}
        summary={
          [
            config?.timecodeSource,
            horaDoJam(config?.tcJamAt) ? `jam ${horaDoJam(config?.tcJamAt)}` : null,
            config?.mediaVerified ? 'cópias conferidas' : null,
          ]
            .filter(Boolean)
            .join(' · ') || 'Não preenchida'
        }
      >
        <div className="flex flex-col gap-3">
          <DebouncedTextField
            label="Fonte do timecode"
            value={config?.timecodeSource ?? ''}
            disabled={!canEdit}
            options={FONTES_TC}
            placeholder="Lockit"
            onCommit={(valor) => void altera({ timecodeSource: valor || null })}
          />

          {/* A hora do jam é o que explica deriva de TC ao longo do dia para a pós — e
              ninguém vai digitá-la no momento em que ela acontece. Um toque grava. */}
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium text-zinc-100">Jam de timecode</p>
              <p className="text-xs text-zinc-400">
                {horaDoJam(config?.tcJamAt)
                  ? `Último jam às ${horaDoJam(config?.tcJamAt)}`
                  : 'Ainda não registrado hoje'}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={!canEdit}
              onClick={() => void altera({ tcJamAt: new Date().toISOString() })}
            >
              Jam agora
            </Button>
          </div>

          <Toggle
            label="Drop frame"
            checked={config?.dropFrame ?? false}
            onChange={(valor) => void altera({ dropFrame: valor })}
          />

          <DebouncedTextField
            label="User bits"
            value={config?.userBits ?? ''}
            disabled={!canEdit}
            placeholder="11 08 26 04"
            onCommit={(valor) => void altera({ userBits: valor || null })}
          />

          <DebouncedTextField
            label="Cópias da mídia"
            value={config?.mediaCopies ?? ''}
            disabled={!canEdit}
            placeholder="cartão → LaCie → nuvem"
            onCommit={(valor) => void altera({ mediaCopies: valor || null })}
          />

          <Toggle
            label="Cópias conferidas"
            emphasis="approved"
            description="A parte da custódia que hoje só vive no caderno"
            checked={config?.mediaVerified ?? false}
            onChange={(valor) => void altera({ mediaVerified: valor })}
          />
        </div>
      </SectionCard>
    </>
  );
}
