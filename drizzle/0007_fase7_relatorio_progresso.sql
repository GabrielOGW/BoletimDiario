CREATE TABLE "daily_progress_report" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"shooting_day_id" uuid NOT NULL,
	"first_take_at" time,
	"pages_shot" text,
	"estimated_minutes" text,
	"scenes_covered" text,
	"scenes_partial" text,
	"scenes_skipped" text,
	"scenes_added" text,
	"notes" text,
	"signed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "daily_progress_report_day" UNIQUE("shooting_day_id")
);
--> statement-breakpoint
ALTER TABLE "daily_progress_report" ADD CONSTRAINT "daily_progress_report_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_progress_report" ADD CONSTRAINT "daily_progress_report_shooting_day_id_shooting_days_id_fk" FOREIGN KEY ("shooting_day_id") REFERENCES "public"."shooting_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_progress_report" ADD CONSTRAINT "daily_progress_report_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_progress_report" ADD CONSTRAINT "daily_progress_report_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_progress_report" ADD CONSTRAINT "daily_progress_report_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Triggers da tabela nova.
--
-- O Drizzle não modela função nem trigger, então toda tabela de domínio precisa ser
-- ligada à mão — e uma tabela de domínio sem `write_sync_log` é um registro que grava
-- localmente, entra na fila, sobe para o servidor e **nunca volta** para os outros
-- dispositivos. O sintoma é cruel: funciona no aparelho de quem escreveu.

CREATE TRIGGER "daily_progress_report_touch"
  BEFORE UPDATE ON "daily_progress_report"
  FOR EACH ROW EXECUTE FUNCTION touch_row();--> statement-breakpoint

CREATE TRIGGER "daily_progress_report_sync_log"
  AFTER INSERT OR UPDATE ON "daily_progress_report"
  FOR EACH ROW EXECUTE FUNCTION write_sync_log();
