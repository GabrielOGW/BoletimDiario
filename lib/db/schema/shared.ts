/**
 * A unidade compartilhada: Cena → Setup → Take.
 *
 * É o coração da plataforma. Câmera, Som e Continuidade **anexam** dados a estes
 * registros; nenhum departamento cria a própria cópia de cena ou de take. É o que faz
 * a duplicação sumir por construção, e não por convenção.
 *
 * As chaves naturais únicas daqui não são detalhe de modelagem: são elas que fazem a
 * criação concorrente convergir. Combinadas com ids derivados (ADR-019), dois
 * dispositivos offline criando "o take 4 do setup C" produzem o mesmo id e o mesmo
 * registro — a colisão vira convergência, não erro.
 */

import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { audit } from './columns';
import { dayNightEnum, intExtEnum, takeStatusEnum } from './enums';
import { productions, shootingDays } from './production';

export const scenes = pgTable(
  'scenes',
  {
    id: uuid('id').primaryKey(),
    productionId: uuid('production_id')
      .notNull()
      .references(() => productions.id, { onDelete: 'cascade' }),
    /** "24" */
    number: text('number').notNull(),
    /** "B" — na claquete, `number` + `block` é lido como "cena 24B" (ADR-002). */
    block: text('block'),
    page: text('page'),
    storyDay: text('story_day'),
    intExt: intExtEnum('int_ext'),
    dayNight: dayNightEnum('day_night'),
    location: text('location'),
    description: text('description'),
    characters: text('characters').array(),
    ...audit(),
  },
  (t) => [
    unique('scenes_production_number_block').on(t.productionId, t.number, t.block),
    index('scenes_production').on(t.productionId),
  ],
);

export const setups = pgTable(
  'setups',
  {
    id: uuid('id').primaryKey(),
    productionId: uuid('production_id')
      .notNull()
      .references(() => productions.id, { onDelete: 'cascade' }),
    sceneId: uuid('scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    shootingDayId: uuid('shooting_day_id').references(() => shootingDays.id),
    /** "A", "B", "C" — ou "1", "2". */
    code: text('code').notNull(),
    name: text('name'),
    /**
     * Tipo de captação: Normal, Série, Insert, Pickup, Drone.
     *
     * `text` livre e não enum: é o `Plano.tipo` do boletim, que sempre aceitou valor
     * digitado ("Dolly de aproximação"), e um enum transformaria isso em perda de dado
     * na importação. `Setup.kind` no modelo compartilhado.
     */
    kind: text('kind'),
    shotSize: text('shot_size'),
    angle: text('angle'),
    movement: text('movement'),
    screenDirection: text('screen_direction'),
    eyeline: text('eyeline'),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...audit(),
  },
  (t) => [
    /**
     * A diária entra na chave de propósito: a mesma cena remontada no dia seguinte é
     * genuinamente outro setup (luz desmontada, câmera reposicionada). Sem isso, uma
     * cena gravada em dois dias perderia a associação de um deles.
     */
    unique('setups_scene_day_code').on(t.sceneId, t.shootingDayId, t.code),
    index('setups_production_day').on(t.productionId, t.shootingDayId),
  ],
);

export const takes = pgTable(
  'takes',
  {
    id: uuid('id').primaryKey(),
    productionId: uuid('production_id')
      .notNull()
      .references(() => productions.id, { onDelete: 'cascade' }),
    setupId: uuid('setup_id')
      .notNull()
      .references(() => setups.id, { onDelete: 'cascade' }),
    /** Inteiro de verdade: ordena e incrementa. */
    number: integer('number').notNull(),
    /** O status da tomada como evento de set — o que a claquete diz (ADR-010). */
    status: takeStatusEnum('status').notNull().default('RECORDED'),
    durationSec: integer('duration_sec'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    notes: text('notes'),
    ...audit(),
  },
  (t) => [
    unique('takes_setup_number').on(t.setupId, t.number),
    index('takes_production_setup_number').on(t.productionId, t.setupId, t.number),
  ],
);
