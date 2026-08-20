/**
 * Dados de Continuidade anexados ao Take compartilhado, mais o estado do set.
 *
 * Os campos são texto livre de propósito: tentar estruturar "João entra pela esquerda"
 * em enums seria mais lento que escrever, e é assim que a ferramenta é abandonada. O
 * que a estrutura entrega é **busca** e **relacionamento com o take**, não taxonomia.
 *
 * **Não há fotografias** (ADR-022).
 */

import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { audit } from './columns';
import { takeStatusEnum } from './enums';
import { productions } from './production';
import { scenes, setups, takes } from './shared';

export const continuityTakeData = pgTable(
  'continuity_take_data',
  {
    id: uuid('id').primaryKey(),
    productionId: uuid('production_id')
      .notNull()
      .references(() => productions.id, { onDelete: 'cascade' }),
    takeId: uuid('take_id')
      .notNull()
      .references(() => takes.id, { onDelete: 'cascade' }),
    status: takeStatusEnum('status'),
    /** Motivo do NG. "NG" sem motivo é anotação inútil na pós (ADR-029). */
    ngReason: text('ng_reason'),
    /** O "circled" da continuísta. */
    selected: boolean('selected').notNull().default(false),
    durationSec: integer('duration_sec'),
    startPosition: text('start_position'),
    endPosition: text('end_position'),
    action: text('action'),
    movement: text('movement'),
    direction: text('direction'),
    entrancesExits: text('entrances_exits'),
    eyeline: text('eyeline'),
    objectInteraction: text('object_interaction'),
    characterInteraction: text('character_interaction'),
    dialogueChanges: text('dialogue_changes'),
    improvisation: text('improvisation'),
    scriptDeviation: text('script_deviation'),
    notes: text('notes'),
    ...audit(),
  },
  (t) => [
    unique('continuity_take_data_take').on(t.takeId),
    index('continuity_take_data_production_take').on(t.productionId, t.takeId),
  ],
);

/**
 * Escopo flexível das quatro coleções de estado: cada item pode se prender a uma cena,
 * a um setup ou a um take — pelo menos um.
 *
 * Isso é essencial e não é preguiça de modelagem: um figurino vale para a cena inteira;
 * um copo pela metade vale para um take específico. Forçar tudo ao mesmo nível
 * obrigaria a repetir o figurino em cada take, ou a perder a precisão do copo.
 */
const continuityScope = () => ({
  id: uuid('id').primaryKey(),
  productionId: uuid('production_id')
    .notNull()
    .references(() => productions.id, { onDelete: 'cascade' }),
  sceneId: uuid('scene_id').references(() => scenes.id, { onDelete: 'cascade' }),
  setupId: uuid('setup_id').references(() => setups.id, { onDelete: 'cascade' }),
  takeId: uuid('take_id').references(() => takes.id, { onDelete: 'cascade' }),
});

const atLeastOneScope = (name: string) =>
  check(name, sql`num_nonnulls(scene_id, setup_id, take_id) >= 1`);

/**
 * Sobre os índices das quatro coleções (migration `0009`, Fase 10).
 *
 * Elas nasceram na Fase 7 com a `check` de escopo e **sem índice nenhum além da PK**, e o
 * defeito só aparece com volume: o snapshot as lê por `production_id` + escopo, e com dez
 * cenas ninguém nota a varredura sequencial. Com duzentas — o tamanho de um longa no meio
 * das filmagens — ela entra no caminho da **fixação da diária**, que é a primeira coisa
 * que acontece de manhã e a única requisição obrigatória da fronteira offline.
 *
 * Dois índices por tabela, e não três: `setup_id` não é recorte de nenhuma consulta de
 * servidor (o snapshot corta por cena da produção ou por take da diária), e índice que
 * ninguém usa é escrita mais cara em toda anotação de continuidade.
 */

export const continuityProps = pgTable(
  'continuity_props',
  {
    ...continuityScope(),
    /** "Copo" */
    name: text('name').notNull(),
    /** "Mesa lado direito" */
    position: text('position'),
    /** "50% cheio" */
    state: text('state'),
    quantity: text('quantity'),
    /** "Ator segura na mão direita" */
    interaction: text('interaction'),
    notes: text('notes'),
    ...audit(),
  },
  (t) => [
    atLeastOneScope('continuity_props_scope'),
    index('continuity_props_production_scene').on(t.productionId, t.sceneId),
    index('continuity_props_production_take').on(t.productionId, t.takeId),
  ],
);

export const continuityWardrobe = pgTable(
  'continuity_wardrobe',
  {
    ...continuityScope(),
    character: text('character').notNull(),
    outfit: text('outfit'),
    accessories: text('accessories'),
    state: text('state'),
    notes: text('notes'),
    ...audit(),
  },
  (t) => [
    atLeastOneScope('continuity_wardrobe_scope'),
    index('continuity_wardrobe_production_scene').on(t.productionId, t.sceneId),
    index('continuity_wardrobe_production_take').on(t.productionId, t.takeId),
  ],
);

export const continuityHairMakeup = pgTable(
  'continuity_hair_makeup',
  {
    ...continuityScope(),
    character: text('character').notNull(),
    state: text('state'),
    changes: text('changes'),
    notes: text('notes'),
    ...audit(),
  },
  (t) => [
    atLeastOneScope('continuity_hair_makeup_scope'),
    index('continuity_hair_makeup_production_scene').on(t.productionId, t.sceneId),
    index('continuity_hair_makeup_production_take').on(t.productionId, t.takeId),
  ],
);

export const continuitySetDressing = pgTable(
  'continuity_set_dressing',
  {
    ...continuityScope(),
    element: text('element').notNull(),
    position: text('position'),
    state: text('state'),
    notes: text('notes'),
    ...audit(),
  },
  (t) => [
    atLeastOneScope('continuity_set_dressing_scope'),
    index('continuity_set_dressing_production_scene').on(t.productionId, t.sceneId),
    index('continuity_set_dressing_production_take').on(t.productionId, t.takeId),
  ],
);
