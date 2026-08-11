'use client';

import { useActionState, useState } from 'react';

import { SectionCard } from '@/components/layout/SectionCard';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TextAreaField } from '@/components/ui/TextAreaField';
import { TextField } from '@/components/ui/TextField';
import { CalendarIcon, ClockIcon } from '@/components/ui/icons';
import type { ShootingDayRow } from '@/lib/db/queries/shooting-days';
import { FormError } from '@/features/auth/AuthCard';

import { excluirDiariaAction, salvarDiariaAction } from './actions';
import { SubmitButton } from './SubmitButton';

/** `13:30:00` do Postgres → `13:30` do `<input type="time">`. */
function hhmm(value: string | null): string {
  return value ? value.slice(0, 5) : '';
}

/**
 * Criar e editar usam o mesmo formulário — a única diferença é a presença do `dayId`.
 * Duplicar a tela para ganhar dois títulos seria trocar manutenção por nada.
 */
export function DiariaForm({
  productionId,
  diaria,
}: {
  productionId: string;
  diaria?: ShootingDayRow;
}) {
  const [state, save] = useActionState(salvarDiariaAction, {});
  const [deleteState, remove] = useActionState(excluirDiariaAction, {});
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <form action={save} className="flex flex-col gap-4">
        <input type="hidden" name="productionId" value={productionId} />
        {diaria ? <input type="hidden" name="dayId" value={diaria.id} /> : null}

        <SectionCard title="A diária" icon={<CalendarIcon size={18} />}>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Data"
                name="date"
                type="date"
                defaultValue={diaria?.date ?? ''}
                required
              />
              <TextField
                label="Diária nº"
                name="dayNumber"
                defaultValue={diaria?.dayNumber ?? ''}
                placeholder="12"
                hint="Aceita 12A, 12B."
              />
            </div>
            <TextField
              label="Unidade"
              name="unit"
              defaultValue={diaria?.unit ?? ''}
              placeholder="Unidade principal"
              hint="Duas unidades no mesmo dia são duas diárias."
            />
            <TextField
              label="Locação"
              name="location"
              defaultValue={diaria?.location ?? ''}
              placeholder="Estúdio 3"
            />
          </div>
        </SectionCard>

        <SectionCard title="Horários" icon={<ClockIcon size={18} />}>
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Call"
              name="callTime"
              type="time"
              defaultValue={hhmm(diaria?.callTime ?? null)}
            />
            <TextField
              label="Wrap"
              name="wrapTime"
              type="time"
              defaultValue={hhmm(diaria?.wrapTime ?? null)}
            />
            <TextField
              label="Almoço — início"
              name="lunchStart"
              type="time"
              defaultValue={hhmm(diaria?.lunchStart ?? null)}
            />
            <TextField
              label="Almoço — fim"
              name="lunchEnd"
              type="time"
              defaultValue={hhmm(diaria?.lunchEnd ?? null)}
            />
          </div>
        </SectionCard>

        <SectionCard title="Observações">
          <TextAreaField
            label="Notas da diária"
            name="notes"
            defaultValue={diaria?.notes ?? ''}
            rows={4}
          />
        </SectionCard>

        <FormError>{state.error}</FormError>

        <SubmitButton variant="primary" size="lg" fullWidth pendingLabel="Salvando…">
          {diaria ? 'Salvar diária' : 'Criar diária'}
        </SubmitButton>
      </form>

      {diaria ? (
        <>
          <form action={remove} id="excluir-diaria" className="hidden">
            <input type="hidden" name="productionId" value={productionId} />
            <input type="hidden" name="dayId" value={diaria.id} />
          </form>

          <FormError>{deleteState.error}</FormError>

          <Button
            variant="ghost"
            fullWidth
            className="mt-2 text-red-400"
            onClick={() => setConfirming(true)}
          >
            Excluir diária
          </Button>

          <ConfirmDialog
            open={confirming}
            title="Excluir esta diária?"
            description="Ela sai da lista da produção. O registro não é apagado do banco."
            confirmLabel="Excluir"
            destructive
            onConfirm={() => {
              setConfirming(false);
              const form = document.getElementById('excluir-diaria');
              if (form instanceof HTMLFormElement) form.requestSubmit();
            }}
            onCancel={() => setConfirming(false)}
          />
        </>
      ) : null}
    </>
  );
}
