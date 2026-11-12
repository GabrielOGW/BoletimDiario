/**
 * Dados de Continuidade anexados ao Take compartilhado, mais o estado do set.
 *
 * Os campos são texto livre de propósito: tentar estruturar "João entra pela esquerda"
 * em enums seria mais lento que escrever, e é assim que a ferramenta é abandonada. O
 * que a estrutura entrega é **busca** e **relacionamento com o take**, não taxonomia.
 *
 * Fotografias voltaram com ADR-042, que revisa ADR-022: `continuity_photos` guarda o
 * registro (escopo, categoria, legenda) e sincroniza como qualquer outro; os bytes moram
 * em `continuity_photo_blobs`, **fora** do `sync_log`, porque são imutáveis e pesados.
 */

import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { users } from './auth';
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
    /**
     * "Este take tem problema de continuidade" — o aviso que a montagem procura antes de
     * cortar dois planos juntos (ADR-042). Booleano e não status: um take pode ser o
     * print do diretor **e** ter o copo na mão errada, e é exatamente esse que importa.
     */
    hasIssue: boolean('has_issue').notNull().default(false),
    /** Qual é o problema — "copo na mão esquerda; no plano A estava na direita". */
    issue: text('issue'),
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

/**
 * Notas de raccord (ADR-042) — a observação de continuidade que não é objeto, figurino,
 * cabelo nem cenário: posição de ator, direção de olhar, movimento entre planos,
 * alteração de diálogo.
 *
 * Mesmo escopo flexível das quatro coleções (cena, setup **ou** take), mas sem chave
 * natural: duas notas de "olhar" na mesma cena são duas observações, não a mesma. O id é
 * aleatório de propósito — convergir aqui seria apagar a nota de alguém.
 */
export const continuityNotes = pgTable(
  'continuity_notes',
  {
    ...continuityScope(),
    /** `ATORES`, `OLHAR`, `MOVIMENTO`, `DIALOGO`, `RACCORD`, `OUTRO` — texto, lista aberta. */
    category: text('category'),
    note: text('note'),
    ...audit(),
  },
  (t) => [
    atLeastOneScope('continuity_notes_scope'),
    index('continuity_notes_production_scene').on(t.productionId, t.sceneId),
    index('continuity_notes_production_take').on(t.productionId, t.takeId),
  ],
);

/**
 * Fotografias de continuidade — o **registro** (ADR-042).
 *
 * Sincroniza pelo caminho normal: escopo, categoria e legenda são campos como outros, e
 * mover a foto da cena para o take é mudança de campo. Os bytes não estão aqui.
 */
export const continuityPhotos = pgTable(
  'continuity_photos',
  {
    ...continuityScope(),
    /** `OBJETOS`, `FIGURINO`, `CABELO_MAQUIAGEM`, `ATORES`, `COMPOSICAO`, `OUTRO`. */
    category: text('category'),
    caption: text('caption'),
    mimeType: text('mime_type'),
    width: integer('width'),
    height: integer('height'),
    sizeBytes: integer('size_bytes'),
    ...audit(),
  },
  (t) => [
    atLeastOneScope('continuity_photos_scope'),
    index('continuity_photos_production_scene').on(t.productionId, t.sceneId),
    index('continuity_photos_production_take').on(t.productionId, t.takeId),
  ],
);

/**
 * Os bytes de cada foto, já comprimidos no aparelho (JPEG, lado maior ≤ 1600 px).
 *
 * **Fora do `sync_log`, sem trigger**: o conteúdo é imutável (editar uma foto é tirar
 * outra), então não há o que fazer merge, e passá-lo pelo pull faria cada aparelho baixar
 * megabytes a cada ciclo. Sobe uma vez por `/api/fotos` e desce sob demanda.
 *
 * Base64 em `text` e não `bytea`: o driver HTTP do Neon serializa parâmetros como JSON, e
 * texto atravessa sem adaptação. O custo (≈33%) está no teto declarado em ADR-042.
 */
export const continuityPhotoBlobs = pgTable('continuity_photo_blobs', {
  photoId: uuid('photo_id')
    .primaryKey()
    .references(() => continuityPhotos.id, { onDelete: 'cascade' }),
  productionId: uuid('production_id')
    .notNull()
    .references(() => productions.id, { onDelete: 'cascade' }),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  dataBase64: text('data_base64').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').references(() => users.id),
});
