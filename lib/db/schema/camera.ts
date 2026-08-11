/**
 * Dados de Câmera anexados ao Take compartilhado.
 *
 * Uma linha **por câmera** por take — multicam real. Técnica e óptica vivem aqui, e
 * não no setup (ADR-011): na prática o foquista troca o T-stop entre takes do mesmo
 * setup, e hoje o app não registra isso. A UI continua parecendo igual, porque o valor
 * é herdado do take anterior e só é editado quando muda.
 */

import { boolean, index, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';

import { audit } from './columns';
import { takeStatusEnum } from './enums';
import { equipment } from './equipment';
import { productions } from './production';
import { takes } from './shared';

/** Generaliza a `CameraCadastrada` do modelo v2. */
export const cameraUnits = pgTable(
  'camera_units',
  {
    id: uuid('id').primaryKey(),
    productionId: uuid('production_id')
      .notNull()
      .references(() => productions.id, { onDelete: 'cascade' }),
    /** "A", "B". */
    label: text('label').notNull(),
    model: text('model'),
    bodySerial: text('body_serial'),
    equipmentId: uuid('equipment_id').references(() => equipment.id),
    operator: text('operator'),
    focusPuller: text('focus_puller'),
    clapper: text('clapper'),
    ...audit(),
  },
  (t) => [unique('camera_units_production_label').on(t.productionId, t.label)],
);

export const cameraTakeData = pgTable(
  'camera_take_data',
  {
    id: uuid('id').primaryKey(),
    productionId: uuid('production_id')
      .notNull()
      .references(() => productions.id, { onDelete: 'cascade' }),
    takeId: uuid('take_id')
      .notNull()
      .references(() => takes.id, { onDelete: 'cascade' }),
    cameraUnitId: uuid('camera_unit_id').references(() => cameraUnits.id),

    /** Julgamento técnico da Câmera — independente de `takes.status` (ADR-010). */
    status: takeStatusEnum('status'),
    /** Motivo do NG. "NG" sem motivo é anotação inútil na pós (ADR-029). */
    ngReason: text('ng_reason'),
    /** "Aprovado pelo diretor" do modelo v2. Preservado para não perder a semântica. */
    approved: boolean('approved').notNull().default(false),

    // mídia
    card: text('card'),
    roll: text('roll'),
    volume: text('volume'),
    fileName: text('file_name'),
    mediaNotes: text('media_notes'),

    // óptica
    lens: text('lens'),
    focalLength: text('focal_length'),
    tStop: text('t_stop'),
    filter: text('filter'),
    matteBox: boolean('matte_box'),

    // configuração
    iso: text('iso'),
    fps: text('fps'),
    shutter: text('shutter'),
    whiteBalance: text('white_balance'),
    resolution: text('resolution'),
    codec: text('codec'),
    aspectRatio: text('aspect_ratio'),
    lut: text('lut'),
    colorSpace: text('color_space'),
    vfx: text('vfx'),

    notes: text('notes'),
    ...audit(),
  },
  (t) => [
    unique('camera_take_data_take_unit').on(t.takeId, t.cameraUnitId),
    index('camera_take_data_production_take').on(t.productionId, t.takeId),
  ],
);
