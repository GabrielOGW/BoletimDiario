/**
 * Queries de equipamento e de alocação por diária.
 *
 * **Fora da fronteira offline** (ADR-016): montar o catálogo é preparação — feita sentada,
 * com sinal, antes de a claquete bater. O que a diária consome disto chega às telas de
 * módulo como **props resolvidas no servidor**, do mesmo jeito que produção, horários e
 * equipe já chegam: a navegação renderizada fica no cache do Service Worker, então o
 * cabeçalho impresso continua saindo em locação sem sinal.
 *
 * **Sobre os ids:** aqui eles são aleatórios, e não derivados de chave natural. ADR-019
 * existe para que dois dispositivos **offline** criando a mesma entidade convirjam — e
 * nada disto é criado offline. Pior: derivar de fabricante+modelo faria dois microfones
 * idênticos sem número de série virarem um registro só, que é exatamente o contrário do
 * que um catálogo precisa.
 */

import 'server-only';

import { and, asc, eq, isNull } from 'drizzle-orm';

import type { Department, EquipmentCategory } from '@/domain/platform/enums';
import { db } from '@/lib/db/client';
import { equipment, equipmentAssignments } from '@/lib/db/schema';

export interface EquipmentRow {
  id: string;
  department: Department;
  category: EquipmentCategory;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  nickname: string | null;
  notes: string | null;
}

const COLUMNS = {
  id: equipment.id,
  department: equipment.department,
  category: equipment.category,
  manufacturer: equipment.manufacturer,
  model: equipment.model,
  serialNumber: equipment.serialNumber,
  nickname: equipment.nickname,
  notes: equipment.notes,
};

/** O catálogo da produção, agrupável por departamento na tela. */
export async function listEquipment(productionId: string): Promise<EquipmentRow[]> {
  return db
    .select(COLUMNS)
    .from(equipment)
    .where(and(eq(equipment.productionId, productionId), isNull(equipment.deletedAt)))
    .orderBy(asc(equipment.department), asc(equipment.category), asc(equipment.model));
}

export async function createEquipment(input: {
  id: string;
  productionId: string;
  department: Department;
  category: EquipmentCategory;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  nickname?: string | null;
  notes?: string | null;
  actorId: string;
}): Promise<string> {
  await db.insert(equipment).values({
    id: input.id,
    productionId: input.productionId,
    department: input.department,
    category: input.category,
    manufacturer: input.manufacturer ?? null,
    model: input.model ?? null,
    serialNumber: input.serialNumber ?? null,
    nickname: input.nickname ?? null,
    notes: input.notes ?? null,
    createdBy: input.actorId,
    updatedBy: input.actorId,
  });

  return input.id;
}

export async function updateEquipment(input: {
  id: string;
  productionId: string;
  values: Partial<Omit<EquipmentRow, 'id'>>;
  actorId: string;
}): Promise<void> {
  await db
    .update(equipment)
    .set({ ...input.values, updatedBy: input.actorId })
    .where(
      and(eq(equipment.id, input.id), eq(equipment.productionId, input.productionId)),
    );
}

/**
 * Exclusão lógica — como tudo no domínio (ADR-015).
 *
 * Um equipamento apagado de verdade levaria junto o histórico: `sound_take_tracks` e
 * `camera_units` apontam para ele, e um boletim de três meses atrás não pode passar a
 * dizer que o take foi gravado com nada.
 */
export async function deleteEquipment(input: {
  id: string;
  productionId: string;
  actorId: string;
}): Promise<void> {
  await db
    .update(equipment)
    .set({ deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId })
    .where(
      and(eq(equipment.id, input.id), eq(equipment.productionId, input.productionId)),
    );
}

// ---- "O que estamos usando hoje" (§23) ----

export interface AssignmentRow {
  id: string;
  equipmentId: string;
  department: Department;
  category: EquipmentCategory;
  label: string | null;
  notes: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  nickname: string | null;
}

/*
 * `equipment_assignments.member_id` existe no schema — "quem está com ele" é parte do §23 —
 * mas **não é lido aqui**, porque nada ainda o escreve: não há tela que atribua o item a uma
 * pessoa. Trazê-lo custaria dois LEFT JOIN por consulta para devolver `null`, e um campo que
 * sempre volta vazio é como uma tela passa a "quase" ter uma funcionalidade. Entra junto com
 * a tela que o preencher.
 */

/**
 * O que está alocado numa diária, com o equipamento já resolvido.
 *
 * É a consulta que responde "hoje o som está com MKH 50 e DPA 4060" para a continuísta —
 * a pergunta que hoje se faz gritando de um lado ao outro da locação.
 */
export async function listAssignments(input: {
  productionId: string;
  shootingDayId: string;
}): Promise<AssignmentRow[]> {
  return db
    .select({
      id: equipmentAssignments.id,
      equipmentId: equipmentAssignments.equipmentId,
      department: equipmentAssignments.department,
      category: equipment.category,
      label: equipmentAssignments.label,
      notes: equipmentAssignments.notes,
      manufacturer: equipment.manufacturer,
      model: equipment.model,
      serialNumber: equipment.serialNumber,
      nickname: equipment.nickname,
    })
    .from(equipmentAssignments)
    .innerJoin(equipment, eq(equipment.id, equipmentAssignments.equipmentId))
    .where(
      and(
        eq(equipmentAssignments.productionId, input.productionId),
        eq(equipmentAssignments.shootingDayId, input.shootingDayId),
        isNull(equipmentAssignments.deletedAt),
        isNull(equipment.deletedAt),
      ),
    )
    .orderBy(asc(equipmentAssignments.department), asc(equipment.category));
}

export async function assignEquipment(input: {
  id: string;
  productionId: string;
  equipmentId: string;
  shootingDayId: string;
  department: Department;
  label?: string | null;
  actorId: string;
}): Promise<void> {
  await db.insert(equipmentAssignments).values({
    id: input.id,
    productionId: input.productionId,
    equipmentId: input.equipmentId,
    shootingDayId: input.shootingDayId,
    department: input.department,
    label: input.label ?? null,
    createdBy: input.actorId,
    updatedBy: input.actorId,
  });
}

export async function unassignEquipment(input: {
  id: string;
  productionId: string;
  actorId: string;
}): Promise<void> {
  await db
    .update(equipmentAssignments)
    .set({ deletedAt: new Date(), deletedBy: input.actorId, updatedBy: input.actorId })
    .where(
      and(
        eq(equipmentAssignments.id, input.id),
        eq(equipmentAssignments.productionId, input.productionId),
      ),
    );
}
