'use client';

import { useActionState, useState } from 'react';

import { SectionCard } from '@/components/layout/SectionCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { PlusIcon, TrashIcon } from '@/components/ui/icons';
import { IconButton } from '@/components/ui/IconButton';
import type { AssignmentRow, EquipmentRow } from '@/lib/db/queries/equipment';
import { FormError } from '@/features/auth/AuthCard';

import { alocarEquipamentoAction, desalocarEquipamentoAction } from './actions';
import { CATEGORY_LABEL, DEPARTMENT_LABEL, descreveEquipamento } from './labels';
import { SubmitButton } from './SubmitButton';

/**
 * "O que estamos usando hoje" (§23) — a alocação de equipamento na diária.
 *
 * É a pergunta que hoje se faz gritando de um lado ao outro da locação: a continuísta
 * precisa saber que o som está com MKH 50 e DPA 4060 para anotar direito, e a pós precisa
 * do modelo impresso no cabeçalho do relatório.
 *
 * Mora na **sala**, não no módulo: alocar é preparação do dia, feita com sinal. O que a
 * diária consome disto chega às telas de módulo como props resolvidas no servidor — a
 * mesma via de produção, horários e equipe.
 */
export function EquipmentDoDia({
  productionId,
  shootingDayId,
  catalogo,
  alocados,
  canManage,
}: {
  productionId: string;
  shootingDayId: string;
  catalogo: EquipmentRow[];
  alocados: AssignmentRow[];
  canManage: boolean;
}) {
  const [alocando, setAlocando] = useState(false);

  const jaAlocados = new Set(alocados.map((linha) => linha.equipmentId));
  const disponiveis = catalogo.filter((item) => !jaAlocados.has(item.id));

  const porDepartamento = new Map<string, AssignmentRow[]>();
  for (const linha of alocados) {
    porDepartamento.set(linha.department, [
      ...(porDepartamento.get(linha.department) ?? []),
      linha,
    ]);
  }

  return (
    <SectionCard
      title="Equipamento do dia"
      collapsible
      defaultOpen={alocados.length > 0}
      summary={alocados.length === 0 ? 'Nada alocado' : `${alocados.length} item(ns)`}
    >
      <div className="flex flex-col gap-3">
        {alocados.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nada alocado nesta diária. O que for alocado aqui aparece para os três
            departamentos e sai impresso no cabeçalho dos boletins.
          </p>
        ) : null}

        {[...porDepartamento.entries()].map(([departamento, itens]) => (
          <div key={departamento} className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {DEPARTMENT_LABEL[departamento as keyof typeof DEPARTMENT_LABEL] ??
                departamento}
            </p>

            {itens.map((linha) => (
              <div
                key={linha.id}
                className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                  {descreveEquipamento(linha)}
                </span>
                <Badge tone="neutral">
                  {CATEGORY_LABEL[linha.category] ?? linha.category}
                </Badge>
                {canManage ? (
                  <Desalocar
                    productionId={productionId}
                    shootingDayId={shootingDayId}
                    assignmentId={linha.id}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ))}

        {canManage && disponiveis.length > 0 ? (
          alocando ? (
            <FormularioDeAlocacao
              productionId={productionId}
              shootingDayId={shootingDayId}
              disponiveis={disponiveis}
              onFechar={() => setAlocando(false)}
            />
          ) : (
            <Button
              variant="secondary"
              leftIcon={<PlusIcon size={16} />}
              onClick={() => setAlocando(true)}
            >
              Alocar equipamento
            </Button>
          )
        ) : null}

        {canManage && catalogo.length === 0 ? (
          <p className="text-xs text-zinc-500">
            O catálogo da produção está vazio. Cadastre o equipamento uma vez em
            Equipamentos, e depois é só alocar em cada diária.
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}

function FormularioDeAlocacao({
  productionId,
  shootingDayId,
  disponiveis,
  onFechar,
}: {
  productionId: string;
  shootingDayId: string;
  disponiveis: EquipmentRow[];
  onFechar: () => void;
}) {
  const [state, action] = useActionState(alocarEquipamentoAction, {});

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="productionId" value={productionId} />
      <input type="hidden" name="shootingDayId" value={shootingDayId} />

      <SelectField
        label="Equipamento"
        name="equipmentId"
        required
        options={disponiveis.map((item) => ({
          value: item.id,
          // O departamento vai no rótulo porque a lista é de todos: a mesma tela aloca o
          // corpo da câmera e o boom, e ler "Som · MKH 416" evita alocar no lugar errado.
          label: `${DEPARTMENT_LABEL[item.department]} · ${descreveEquipamento(item)}`,
        }))}
      />

      <TextField
        label="Função no dia"
        name="label"
        placeholder="Boom principal"
        hint="Opcional — como este item é usado nesta diária"
      />

      <FormError>{state.error}</FormError>

      <div className="flex gap-2">
        <SubmitButton>Alocar</SubmitButton>
        <Button variant="ghost" onClick={onFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function Desalocar({
  productionId,
  shootingDayId,
  assignmentId,
}: {
  productionId: string;
  shootingDayId: string;
  assignmentId: string;
}) {
  const [state, action] = useActionState(desalocarEquipamentoAction, {});

  return (
    <form action={action}>
      <input type="hidden" name="productionId" value={productionId} />
      <input type="hidden" name="shootingDayId" value={shootingDayId} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      {/* Sem confirmação: desalocar não apaga nada — o equipamento continua no catálogo e
          nos boletins já preenchidos. Confirmação só para o que é irreversível. */}
      <IconButton
        type="submit"
        label="Desalocar"
        variant="danger"
        icon={<TrashIcon size={16} />}
      />
      <FormError>{state.error}</FormError>
    </form>
  );
}
