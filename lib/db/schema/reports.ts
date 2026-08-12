/**
 * Relatório de Progresso da Diária.
 *
 * O entregável que a produção consome todo dia e que o levantamento de `2026-08-10`
 * descobriu faltando por inteiro ([continuity.md §7](../../../docs/features/continuity.md)).
 * Não é relatório de takes: é o balanço do dia.
 *
 * **Só o que exige mão humana tem coluna.** Cenas rodadas, setups, takes, cartões e rolls
 * saem dos registros que já existem — guardá-los aqui criaria dois números para o mesmo
 * fato, e o guardado estaria sempre um pouco mais velho que o verdadeiro (ADR-034).
 *
 * Uma linha por diária, id derivado da diária: a continuísta e a produção abrindo o
 * relatório ao mesmo tempo, cada uma sem rede, escrevem no **mesmo** registro (ADR-019).
 */

import { pgTable, text, time, unique, uuid } from 'drizzle-orm/pg-core';

import { audit } from './columns';
import { productions, shootingDays } from './production';

export const dailyProgressReport = pgTable(
  'daily_progress_report',
  {
    id: uuid('id').primaryKey(),
    productionId: uuid('production_id')
      .notNull()
      .references(() => productions.id, { onDelete: 'cascade' }),
    shootingDayId: uuid('shooting_day_id')
      .notNull()
      .references(() => shootingDays.id, { onDelete: 'cascade' }),
    /** Hora do primeiro take. Ninguém preenche `takes.started_at` em set; isto sim. */
    firstTakeAt: time('first_take_at'),
    /** Páginas rodadas na convenção do setor: "2 4/8". A soma vive no domínio, puro. */
    pagesShot: text('pages_shot'),
    /** Minutagem estimada do material do dia: "3:20". */
    estimatedMinutes: text('estimated_minutes'),
    /**
     * Cobertura em lista de números de cena — "24, 25A, 31".
     *
     * `text`, e não uma tabela cena×diária: é assim que o formulário de papel funciona, é
     * o que sai impresso, e uma tabela obrigaria a marcar cena por cena na hora do wrap —
     * o pior momento do dia para pedir precisão de banco de dados.
     */
    scenesCovered: text('scenes_covered'),
    scenesPartial: text('scenes_partial'),
    scenesSkipped: text('scenes_skipped'),
    scenesAdded: text('scenes_added'),
    notes: text('notes'),
    /** Quem assina. Livre: quem preenche nem sempre é quem assina. */
    signedBy: text('signed_by'),
    ...audit(),
  },
  (t) => [unique('daily_progress_report_day').on(t.shootingDayId)],
);
