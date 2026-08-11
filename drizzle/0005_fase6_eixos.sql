-- Os dois eixos do take (ADR-029): julgamento e natureza.
--
-- Editada à mão a partir da geração do drizzle-kit, por um motivo que não é estético: o
-- arquivo gerado recriava `take_status` sem `WILD`/`ROOM_TONE`/`FALSE_START` e só DEPOIS
-- acrescentava `takes.kind`. Qualquer linha já gravada com um desses três valores faria a
-- conversão de volta falhar — a migration morreria no meio, num banco com dado real.
--
-- A ordem correta é: criar o eixo novo, MOVER o dado para ele, e só então mexer no enum
-- antigo. Depois do passo 3 nenhuma linha carrega valor de natureza no campo de
-- julgamento, e a conversão passa a ser trivialmente segura.

-- ---------------------------------------------------------------------------
-- 1. O eixo novo
-- ---------------------------------------------------------------------------
CREATE TYPE "public"."take_kind" AS ENUM('SYNC', 'MOS', 'WILD', 'ROOM_TONE', 'WILD_LINES', 'PLAYBACK', 'PICKUP', 'SERIES', 'FALSE_START');--> statement-breakpoint
ALTER TABLE "takes" ADD COLUMN "kind" "take_kind" DEFAULT 'SYNC' NOT NULL;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Mover a natureza para o eixo novo
-- ---------------------------------------------------------------------------
-- Cada `update` só toca no que ainda está em `SYNC`, então o primeiro sinal encontrado
-- vence e a ordem abaixo é a ordem de confiança: o que o som marcou explicitamente vale
-- mais que um status que servia de dois eixos ao mesmo tempo.

UPDATE "takes" t SET "kind" = 'ROOM_TONE'
  FROM "sound_take_data" s WHERE s."take_id" = t."id" AND s."room_tone" = true;--> statement-breakpoint
UPDATE "takes" t SET "kind" = 'WILD_LINES'
  FROM "sound_take_data" s WHERE s."take_id" = t."id" AND s."wild_lines" = true AND t."kind" = 'SYNC';--> statement-breakpoint
UPDATE "takes" t SET "kind" = 'WILD'
  FROM "sound_take_data" s WHERE s."take_id" = t."id" AND s."wild" = true AND t."kind" = 'SYNC';--> statement-breakpoint
UPDATE "takes" t SET "kind" = 'FALSE_START'
  FROM "sound_take_data" s WHERE s."take_id" = t."id" AND s."false_start" = true AND t."kind" = 'SYNC';--> statement-breakpoint

-- O status do take compartilhado e o de cada departamento também carregavam natureza.
UPDATE "takes" SET "kind" = "status"::text::"public"."take_kind"
  WHERE "status"::text IN ('WILD', 'ROOM_TONE', 'FALSE_START') AND "kind" = 'SYNC';--> statement-breakpoint
UPDATE "takes" t SET "kind" = c."status"::text::"public"."take_kind"
  FROM "camera_take_data" c WHERE c."take_id" = t."id"
   AND c."status"::text IN ('WILD', 'ROOM_TONE', 'FALSE_START') AND t."kind" = 'SYNC';--> statement-breakpoint
UPDATE "takes" t SET "kind" = s."status"::text::"public"."take_kind"
  FROM "sound_take_data" s WHERE s."take_id" = t."id"
   AND s."status"::text IN ('WILD', 'ROOM_TONE', 'FALSE_START') AND t."kind" = 'SYNC';--> statement-breakpoint
UPDATE "takes" t SET "kind" = k."status"::text::"public"."take_kind"
  FROM "continuity_take_data" k WHERE k."take_id" = t."id"
   AND k."status"::text IN ('WILD', 'ROOM_TONE', 'FALSE_START') AND t."kind" = 'SYNC';--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. Esvaziar o eixo de julgamento dos valores que mudaram de eixo
-- ---------------------------------------------------------------------------
-- `RECORDED` e não `null`: o take existe e foi gravado — era isso que "WILD" também dizia.
UPDATE "takes" SET "status" = 'RECORDED'
  WHERE "status"::text IN ('WILD', 'ROOM_TONE', 'FALSE_START');--> statement-breakpoint
UPDATE "camera_take_data" SET "status" = 'RECORDED'
  WHERE "status"::text IN ('WILD', 'ROOM_TONE', 'FALSE_START');--> statement-breakpoint
UPDATE "sound_take_data" SET "status" = 'RECORDED'
  WHERE "status"::text IN ('WILD', 'ROOM_TONE', 'FALSE_START');--> statement-breakpoint
UPDATE "continuity_take_data" SET "status" = 'RECORDED'
  WHERE "status"::text IN ('WILD', 'ROOM_TONE', 'FALSE_START');--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. Recriar `take_status` só com julgamento (+ HOLD)
-- ---------------------------------------------------------------------------
-- Postgres não remove valor de enum: o tipo é recriado. As colunas passam por `text` no
-- caminho, que é por onde o drizzle-kit já as levava.
ALTER TABLE "takes" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "takes" ALTER COLUMN "status" SET DEFAULT 'RECORDED'::text;--> statement-breakpoint
ALTER TABLE "camera_take_data" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "sound_take_data" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "continuity_take_data" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."take_status";--> statement-breakpoint
CREATE TYPE "public"."take_status" AS ENUM('RECORDED', 'CIRCLE', 'HOLD', 'NG', 'PARTIAL');--> statement-breakpoint
ALTER TABLE "takes" ALTER COLUMN "status" SET DEFAULT 'RECORDED'::"public"."take_status";--> statement-breakpoint
ALTER TABLE "takes" ALTER COLUMN "status" SET DATA TYPE "public"."take_status" USING "status"::"public"."take_status";--> statement-breakpoint
ALTER TABLE "camera_take_data" ALTER COLUMN "status" SET DATA TYPE "public"."take_status" USING "status"::"public"."take_status";--> statement-breakpoint
ALTER TABLE "sound_take_data" ALTER COLUMN "status" SET DATA TYPE "public"."take_status" USING "status"::"public"."take_status";--> statement-breakpoint
ALTER TABLE "continuity_take_data" ALTER COLUMN "status" SET DATA TYPE "public"."take_status" USING "status"::"public"."take_status";--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 5. Motivo do NG, por departamento — "NG" sem motivo é anotação inútil na pós
-- ---------------------------------------------------------------------------
ALTER TABLE "camera_take_data" ADD COLUMN "ng_reason" text;--> statement-breakpoint
ALTER TABLE "sound_take_data" ADD COLUMN "ng_reason" text;--> statement-breakpoint
ALTER TABLE "continuity_take_data" ADD COLUMN "ng_reason" text;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 6. Custódia do áudio — o que o sound report precisa dizer sobre o dia
-- ---------------------------------------------------------------------------
ALTER TABLE "sound_day_config" ADD COLUMN "tc_jam_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sound_day_config" ADD COLUMN "user_bits" text;--> statement-breakpoint
ALTER TABLE "sound_day_config" ADD COLUMN "media_copies" text;--> statement-breakpoint
ALTER TABLE "sound_day_config" ADD COLUMN "media_verified" boolean DEFAULT false NOT NULL;
