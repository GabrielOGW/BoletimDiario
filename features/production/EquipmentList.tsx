'use client';

import { useActionState, useState } from 'react';

import { SectionCard } from '@/components/layout/SectionCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { PlusIcon } from '@/components/ui/icons';
import type { EquipmentRow } from '@/lib/db/queries/equipment';
import { FormError } from '@/features/auth/AuthCard';

import { excluirEquipamentoAction, salvarEquipamentoAction } from './actions';
import { CATEGORY_LABEL, DEPARTMENT_LABEL, descreveEquipamento } from './labels';
import { CATEGORY_OPTIONS, DEPARTMENT_OPTIONS } from './options';
import { SubmitButton } from './SubmitButton';

/**
 * O catálogo de equipamento da produção.
 *
 * **Fora da fronteira offline** (ADR-016): montar o catálogo é preparação — feita sentada,
 * com sinal, antes de a claquete bater. Formulário não controlado, como todo formulário de
 * Server Action da sala: o dono do valor é o `<form>` (ADR-024).
 *
 * Equipamento é dado compartilhado: qualquer `MEMBER`+ cadastra, independentemente do
 * departamento (permissions.md §3). Quem chega com o kit não é sempre quem administra a
 * sala, e um catálogo que só o ADMIN preenche nasce vazio.
 */
export function EquipmentList({
  productionId,
  equipamentos,
  canManage,
}: {
  productionId: string;
  equipamentos: EquipmentRow[];
  canManage: boolean;
}) {
  const [novo, setNovo] = useState(false);

  const porDepartamento = new Map<string, EquipmentRow[]>();
  for (const item of equipamentos) {
    porDepartamento.set(item.department, [
      ...(porDepartamento.get(item.department) ?? []),
      item,
    ]);
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        novo ? (
          <EquipmentForm
            productionId={productionId}
            onFechar={() => setNovo(false)}
            titulo="Novo equipamento"
          />
        ) : (
          <Button
            variant="primary"
            fullWidth
            leftIcon={<PlusIcon size={18} />}
            onClick={() => setNovo(true)}
          >
            Cadastrar equipamento
          </Button>
        )
      ) : null}

      {equipamentos.length === 0 ? (
        <p className="px-1 text-sm text-zinc-400">
          Nenhum equipamento cadastrado. O que for cadastrado aqui pode ser alocado em
          cada diária — e sai impresso no cabeçalho dos boletins.
        </p>
      ) : null}

      {[...porDepartamento.entries()].map(([departamento, itens]) => (
        <SectionCard
          key={departamento}
          title={
            DEPARTMENT_LABEL[departamento as keyof typeof DEPARTMENT_LABEL] ??
            departamento
          }
          collapsible
          summary={`${itens.length} item(ns)`}
        >
          <div className="flex flex-col gap-3">
            {itens.map((item) => (
              <EquipmentCard
                key={item.id}
                productionId={productionId}
                item={item}
                canManage={canManage}
              />
            ))}
          </div>
        </SectionCard>
      ))}
    </div>
  );
}

function EquipmentCard({
  productionId,
  item,
  canManage,
}: {
  productionId: string;
  item: EquipmentRow;
  canManage: boolean;
}) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <EquipmentForm
        productionId={productionId}
        item={item}
        titulo="Editar equipamento"
        onFechar={() => setEditando(false)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-zinc-100">
          {descreveEquipamento(item)}
        </span>
        <Badge tone="neutral">{CATEGORY_LABEL[item.category] ?? item.category}</Badge>
      </div>

      {item.notes ? <p className="text-xs text-zinc-400">{item.notes}</p> : null}

      {canManage ? (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEditando(true)}>
            Editar
          </Button>
          <ExcluirEquipamento productionId={productionId} item={item} />
        </div>
      ) : null}
    </div>
  );
}

function EquipmentForm({
  productionId,
  item,
  titulo,
  onFechar,
}: {
  productionId: string;
  item?: EquipmentRow;
  titulo: string;
  onFechar: () => void;
}) {
  const [state, action] = useActionState(salvarEquipamentoAction, {});

  return (
    <SectionCard title={titulo}>
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="productionId" value={productionId} />
        {item ? <input type="hidden" name="equipmentId" value={item.id} /> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Departamento"
            name="department"
            defaultValue={item?.department ?? 'CAMERA'}
            options={DEPARTMENT_OPTIONS}
            required
          />
          <SelectField
            label="Categoria"
            name="category"
            defaultValue={item?.category ?? 'OTHER'}
            options={CATEGORY_OPTIONS}
            required
          />
          <TextField
            label="Fabricante"
            name="manufacturer"
            defaultValue={item?.manufacturer ?? ''}
            placeholder="Sennheiser"
          />
          <TextField
            label="Modelo"
            name="model"
            defaultValue={item?.model ?? ''}
            placeholder="MKH 416"
          />
          <TextField
            label="Nº de série"
            name="serialNumber"
            defaultValue={item?.serialNumber ?? ''}
            placeholder="416-0421"
          />
          <TextField
            label="Apelido"
            name="nickname"
            defaultValue={item?.nickname ?? ''}
            placeholder="Boom principal"
            hint="Como a equipe chama em set"
          />
        </div>

        <TextField
          label="Observações"
          name="notes"
          defaultValue={item?.notes ?? ''}
          placeholder="Cabo XLR curto vem junto"
        />

        <FormError>{state.error}</FormError>

        <div className="flex gap-2">
          <SubmitButton>Salvar</SubmitButton>
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

function ExcluirEquipamento({
  productionId,
  item,
}: {
  productionId: string;
  item: EquipmentRow;
}) {
  const [state, action] = useActionState(excluirEquipamentoAction, {});
  const [confirmando, setConfirmando] = useState(false);

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setConfirmando(true)}>
        Remover
      </Button>

      <FormError>{state.error}</FormError>

      {/* Formulário oculto e `requestSubmit`: o diálogo é uma camada acima, e movê-lo para
          dentro dele obrigaria a reconstruir os campos ocultos lá — mesmo padrão da
          lista de membros. */}
      <form action={action} id={`remover-equipamento-${item.id}`} className="hidden">
        <input type="hidden" name="productionId" value={productionId} />
        <input type="hidden" name="equipmentId" value={item.id} />
      </form>

      <ConfirmDialog
        open={confirmando}
        title="Remover do catálogo?"
        // Exclusão lógica: o boletim de três meses atrás não pode passar a dizer que o
        // take foi gravado com nada (ADR-015).
        description={`${descreveEquipamento(item)} sai do catálogo e das alocações futuras. Os boletins já preenchidos continuam mostrando o que foi usado.`}
        confirmLabel="Remover"
        destructive
        onConfirm={() => {
          setConfirmando(false);
          submitForm(`remover-equipamento-${item.id}`);
        }}
        onCancel={() => setConfirmando(false)}
      />
    </>
  );
}

function submitForm(id: string) {
  const form = document.getElementById(id);
  if (form instanceof HTMLFormElement) form.requestSubmit();
}
