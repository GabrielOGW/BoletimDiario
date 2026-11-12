/**
 * Dados de Som anexados ao Take compartilhado.
 *
 * Câmera e Som editando o mesmo take **não conflitam**: são tabelas diferentes. É a
 * modelagem eliminando o conflito antes de qualquer estratégia de resolução.
 */

import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { audit } from './columns';
import { takeStatusEnum } from './enums';
import { equipment } from './equipment';
import { productions, shootingDays } from './production';
import { takes } from './shared';

/** Configuração de som da diária: o que vale para o dia inteiro, não por take. */
export const soundDayConfig = pgTable(
  'sound_day_config',
  {
    id: uuid('id').primaryKey(),
    productionId: uuid('production_id')
      .notNull()
      .references(() => productions.id, { onDelete: 'cascade' }),
    shootingDayId: uuid('shooting_day_id')
      .notNull()
      .references(() => shootingDays.id, { onDelete: 'cascade' }),
    sampleRate: text('sample_rate'),
    bitDepth: text('bit_depth'),
    frameRate: text('frame_rate'),
    timecodeSource: text('timecode_source'),
    dropFrame: boolean('drop_frame'),
    /** WAV/BWF. */
    fileFormat: text('file_format'),
    /** poly (true) / mono (false). */
    poly: boolean('poly'),
    media: text('media'),
    roll: text('roll'),
    soundMixer: text('sound_mixer'),
    boomOperator: text('boom_operator'),
    /**
     * Modelo do gravador, em texto livre (ADR-041). O catálogo de equipamentos da sala
     * continua valendo para quem o usa; este campo existe para o som preencher em set,
     * sem rede e sem catálogo cadastrado.
     */
    recorder: text('recorder'),
    /** Observações gerais do som na diária — impressas no sound report. */
    notes: text('notes'),
    /** Hora do jam de timecode — é o que explica deriva ao longo do dia para a pós. */
    tcJamAt: timestamp('tc_jam_at', { withTimezone: true }),
    /** User bits (UBITS): carregam data e roll, e desempatam quando o TC não basta. */
    userBits: text('user_bits'),
    /** Destinos da cópia, em texto livre: "cartão → LaCie → nuvem". Custódia da mídia. */
    mediaCopies: text('media_copies'),
    mediaVerified: boolean('media_verified').notNull().default(false),
    ...audit(),
  },
  (t) => [unique('sound_day_config_day').on(t.shootingDayId)],
);

export const soundTakeData = pgTable(
  'sound_take_data',
  {
    id: uuid('id').primaryKey(),
    productionId: uuid('production_id')
      .notNull()
      .references(() => productions.id, { onDelete: 'cascade' }),
    takeId: uuid('take_id')
      .notNull()
      .references(() => takes.id, { onDelete: 'cascade' }),
    status: takeStatusEnum('status'),
    circled: boolean('circled').notNull().default(false),
    soundRoll: text('sound_roll'),
    fileName: text('file_name'),
    tcStart: text('tc_start'),
    tcEnd: text('tc_end'),
    durationSec: integer('duration_sec'),
    /** Motivo do NG. "NG" sem motivo é anotação inútil na pós (ADR-029). */
    ngReason: text('ng_reason'),
    /**
     * Problemas de captação marcados num toque (ADR-041): códigos separados por vírgula,
     * em ordem canônica — `RUIDO_EXTERNO,ADR`. A lista é aberta: código desconhecido é
     * preservado e impresso como veio, e o detalhe livre mora em `issue_notes`.
     *
     * Texto e não `text[]`: o contrato de sync só transporta escalares, e o Som é um
     * departamento de uma pessoa por take — o merge por campo cobre o caso real.
     */
    issues: text('issues'),
    issueNotes: text('issue_notes'),
    /*
     * `wild`, `room_tone`, `wild_lines` e `false_start` **saíram daqui** na migration
     * 0006: viraram `takes.kind`. A natureza é do take, não do som — a câmera precisa
     * saber que o take foi MOS tanto quanto o som precisa (ADR-029).
     */
    notes: text('notes'),
    ...audit(),
  },
  (t) => [
    unique('sound_take_data_take').on(t.takeId),
    index('sound_take_data_production_take').on(t.productionId, t.takeId),
  ],
);

/** Tracks dinâmicas, **sem** limite de 4 — a limitação do caderno não é do domínio. */
export const soundTakeTracks = pgTable(
  'sound_take_tracks',
  {
    id: uuid('id').primaryKey(),
    productionId: uuid('production_id')
      .notNull()
      .references(() => productions.id, { onDelete: 'cascade' }),
    takeId: uuid('take_id')
      .notNull()
      .references(() => takes.id, { onDelete: 'cascade' }),
    /** 1..N */
    index: integer('index').notNull(),
    /** "Boom", "João". */
    name: text('name'),
    /**
     * O microfone do canal — "MKH 416", "Sanken COS-11".
     *
     * Nasceu documentado como "Lav/Boom/Plant", mas a tela sempre o pediu com exemplo de
     * modelo de microfone, e é isso que está gravado nas diárias existentes. Desde
     * ADR-041 o tipo de captação tem coluna própria (`pickup`) e este campo fica sendo o
     * que os dados já dizem que ele é.
     */
    source: text('source'),
    /** Tipo de captação: Boom, Lapela, Plant, Ambiente, Linha (ADR-041). */
    pickup: text('pickup'),
    equipmentId: uuid('equipment_id').references(() => equipment.id),
    notes: text('notes'),
    ...audit(),
  },
  (t) => [unique('sound_take_tracks_take_index').on(t.takeId, t.index)],
);

/**
 * Rolos / cartões de áudio da diária (ADR-041).
 *
 * O take já dizia em que roll está (`sound_take_data.sound_roll`); faltava o roll dizer o
 * que **ele** é: em que mídia, gravado com quê, e o que aconteceu com ele. A lista de
 * arquivos do roll **não** é guardada aqui — é derivada dos takes que apontam para o
 * mesmo rótulo, senão seriam duas verdades sobre o mesmo arquivo.
 *
 * O id é derivado de `(diária, rótulo)` — duas pessoas cadastrando o roll 004 sem rede
 * convergem para o mesmo registro (ADR-019).
 */
export const soundRolls = pgTable(
  'sound_rolls',
  {
    id: uuid('id').primaryKey(),
    productionId: uuid('production_id')
      .notNull()
      .references(() => productions.id, { onDelete: 'cascade' }),
    shootingDayId: uuid('shooting_day_id')
      .notNull()
      .references(() => shootingDays.id, { onDelete: 'cascade' }),
    /** "004" — o mesmo texto que os takes guardam em `sound_roll`. */
    label: text('label').notNull(),
    /** Identificação física da mídia: "SD #2 · 128 GB". */
    media: text('media'),
    /** Equipamento usado neste roll — quando um segundo gravador entra no meio do dia. */
    recorder: text('recorder'),
    notes: text('notes'),
    ...audit(),
  },
  (t) => [index('sound_rolls_production_day').on(t.productionId, t.shootingDayId)],
);
