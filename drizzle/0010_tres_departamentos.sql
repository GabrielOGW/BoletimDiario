CREATE TABLE "sound_rolls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"shooting_day_id" uuid NOT NULL,
	"label" text NOT NULL,
	"media" text,
	"recorder" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "continuity_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"scene_id" uuid,
	"setup_id" uuid,
	"take_id" uuid,
	"category" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "continuity_notes_scope" CHECK (num_nonnulls(scene_id, setup_id, take_id) >= 1)
);
--> statement-breakpoint
CREATE TABLE "continuity_photo_blobs" (
	"photo_id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"data_base64" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "continuity_photos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"scene_id" uuid,
	"setup_id" uuid,
	"take_id" uuid,
	"category" text,
	"caption" text,
	"mime_type" text,
	"width" integer,
	"height" integer,
	"size_bytes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "continuity_photos_scope" CHECK (num_nonnulls(scene_id, setup_id, take_id) >= 1)
);
--> statement-breakpoint
ALTER TABLE "sound_day_config" ADD COLUMN "recorder" text;--> statement-breakpoint
ALTER TABLE "sound_day_config" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "sound_take_data" ADD COLUMN "issues" text;--> statement-breakpoint
ALTER TABLE "sound_take_data" ADD COLUMN "issue_notes" text;--> statement-breakpoint
ALTER TABLE "sound_take_tracks" ADD COLUMN "pickup" text;--> statement-breakpoint
ALTER TABLE "continuity_take_data" ADD COLUMN "has_issue" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "continuity_take_data" ADD COLUMN "issue" text;--> statement-breakpoint
ALTER TABLE "sound_rolls" ADD CONSTRAINT "sound_rolls_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound_rolls" ADD CONSTRAINT "sound_rolls_shooting_day_id_shooting_days_id_fk" FOREIGN KEY ("shooting_day_id") REFERENCES "public"."shooting_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound_rolls" ADD CONSTRAINT "sound_rolls_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound_rolls" ADD CONSTRAINT "sound_rolls_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound_rolls" ADD CONSTRAINT "sound_rolls_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_notes" ADD CONSTRAINT "continuity_notes_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_notes" ADD CONSTRAINT "continuity_notes_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_notes" ADD CONSTRAINT "continuity_notes_setup_id_setups_id_fk" FOREIGN KEY ("setup_id") REFERENCES "public"."setups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_notes" ADD CONSTRAINT "continuity_notes_take_id_takes_id_fk" FOREIGN KEY ("take_id") REFERENCES "public"."takes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_notes" ADD CONSTRAINT "continuity_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_notes" ADD CONSTRAINT "continuity_notes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_notes" ADD CONSTRAINT "continuity_notes_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_photo_blobs" ADD CONSTRAINT "continuity_photo_blobs_photo_id_continuity_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."continuity_photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_photo_blobs" ADD CONSTRAINT "continuity_photo_blobs_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_photo_blobs" ADD CONSTRAINT "continuity_photo_blobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_photos" ADD CONSTRAINT "continuity_photos_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_photos" ADD CONSTRAINT "continuity_photos_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_photos" ADD CONSTRAINT "continuity_photos_setup_id_setups_id_fk" FOREIGN KEY ("setup_id") REFERENCES "public"."setups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_photos" ADD CONSTRAINT "continuity_photos_take_id_takes_id_fk" FOREIGN KEY ("take_id") REFERENCES "public"."takes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_photos" ADD CONSTRAINT "continuity_photos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_photos" ADD CONSTRAINT "continuity_photos_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_photos" ADD CONSTRAINT "continuity_photos_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sound_rolls_production_day" ON "sound_rolls" USING btree ("production_id","shooting_day_id");--> statement-breakpoint
CREATE INDEX "continuity_notes_production_scene" ON "continuity_notes" USING btree ("production_id","scene_id");--> statement-breakpoint
CREATE INDEX "continuity_notes_production_take" ON "continuity_notes" USING btree ("production_id","take_id");--> statement-breakpoint
CREATE INDEX "continuity_photos_production_scene" ON "continuity_photos" USING btree ("production_id","scene_id");--> statement-breakpoint
CREATE INDEX "continuity_photos_production_take" ON "continuity_photos" USING btree ("production_id","take_id");--> statement-breakpoint

-- Triggers das três tabelas sincronizáveis novas (ADR-041, ADR-042).
--
-- O Drizzle não modela trigger: sem `write_sync_log`, o registro grava no aparelho, sobe
-- para o servidor e nunca volta para os outros dispositivos.
--
-- `continuity_photo_blobs` fica **sem** trigger de propósito: os bytes são imutáveis e
-- não passam pelo pull (ADR-042). Quem precisa deles pede por `/api/fotos`.
--
-- A migração é só aditiva: nenhuma coluna existente muda de tipo ou de sentido, e as duas
-- `NOT NULL` novas (`has_issue`) nascem com default — linha antiga continua válida.

CREATE TRIGGER "sound_rolls_touch"
  BEFORE UPDATE ON "sound_rolls"
  FOR EACH ROW EXECUTE FUNCTION touch_row();--> statement-breakpoint
CREATE TRIGGER "sound_rolls_sync_log"
  AFTER INSERT OR UPDATE ON "sound_rolls"
  FOR EACH ROW EXECUTE FUNCTION write_sync_log();--> statement-breakpoint

CREATE TRIGGER "continuity_notes_touch"
  BEFORE UPDATE ON "continuity_notes"
  FOR EACH ROW EXECUTE FUNCTION touch_row();--> statement-breakpoint
CREATE TRIGGER "continuity_notes_sync_log"
  AFTER INSERT OR UPDATE ON "continuity_notes"
  FOR EACH ROW EXECUTE FUNCTION write_sync_log();--> statement-breakpoint

CREATE TRIGGER "continuity_photos_touch"
  BEFORE UPDATE ON "continuity_photos"
  FOR EACH ROW EXECUTE FUNCTION touch_row();--> statement-breakpoint
CREATE TRIGGER "continuity_photos_sync_log"
  AFTER INSERT OR UPDATE ON "continuity_photos"
  FOR EACH ROW EXECUTE FUNCTION write_sync_log();
