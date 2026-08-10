CREATE TYPE "public"."day_night" AS ENUM('DAY', 'NIGHT', 'DAWN', 'DUSK');--> statement-breakpoint
CREATE TYPE "public"."department" AS ENUM('CAMERA', 'SOUND', 'CONTINUITY', 'DIRECTION', 'PRODUCTION', 'DIT', 'LIGHTING', 'ART', 'WARDROBE', 'MAKEUP', 'EDITORIAL');--> statement-breakpoint
CREATE TYPE "public"."equipment_category" AS ENUM('CAMERA', 'LENS', 'FILTER', 'RECORDER', 'MIXER', 'MICROPHONE', 'WIRELESS', 'TIMECODE', 'MONITOR', 'MEDIA', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."int_ext" AS ENUM('INT', 'EXT', 'INT_EXT');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."sync_op" AS ENUM('CREATE', 'UPDATE', 'DELETE');--> statement-breakpoint
CREATE TYPE "public"."take_status" AS ENUM('RECORDED', 'CIRCLE', 'NG', 'PARTIAL', 'WILD', 'ROOM_TONE', 'FALSE_START');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "production_member_departments" (
	"member_id" uuid NOT NULL,
	"department" "department" NOT NULL,
	CONSTRAINT "production_member_departments_member_id_department_pk" PRIMARY KEY("member_id","department")
);
--> statement-breakpoint
CREATE TABLE "production_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'MEMBER' NOT NULL,
	"department" "department" NOT NULL,
	"display_name" text,
	"job_title" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "production_members_production_user" UNIQUE("production_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "productions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"director" text,
	"dop" text,
	"join_code" text NOT NULL,
	"join_enabled" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "productions_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "shooting_days" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"date" date NOT NULL,
	"day_number" text,
	"unit" text,
	"location" text,
	"call_time" time,
	"wrap_time" time,
	"lunch_start" time,
	"lunch_end" time,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "shooting_days_production_date_unit" UNIQUE("production_id","date","unit")
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"number" text NOT NULL,
	"block" text,
	"page" text,
	"story_day" text,
	"int_ext" "int_ext",
	"day_night" "day_night",
	"location" text,
	"description" text,
	"characters" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "scenes_production_number_block" UNIQUE("production_id","number","block")
);
--> statement-breakpoint
CREATE TABLE "setups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"scene_id" uuid NOT NULL,
	"shooting_day_id" uuid,
	"code" text NOT NULL,
	"name" text,
	"shot_size" text,
	"angle" text,
	"movement" text,
	"screen_direction" text,
	"eyeline" text,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "setups_scene_day_code" UNIQUE("scene_id","shooting_day_id","code")
);
--> statement-breakpoint
CREATE TABLE "takes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"setup_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" "take_status" DEFAULT 'RECORDED' NOT NULL,
	"duration_sec" integer,
	"started_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "takes_setup_number" UNIQUE("setup_id","number")
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"department" "department" NOT NULL,
	"category" "equipment_category" NOT NULL,
	"manufacturer" text,
	"model" text,
	"serial_number" text,
	"nickname" text,
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
CREATE TABLE "equipment_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	"shooting_day_id" uuid,
	"member_id" uuid,
	"department" "department" NOT NULL,
	"label" text,
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
CREATE TABLE "camera_take_data" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"take_id" uuid NOT NULL,
	"camera_unit_id" uuid,
	"status" "take_status",
	"approved" boolean DEFAULT false NOT NULL,
	"card" text,
	"roll" text,
	"volume" text,
	"file_name" text,
	"media_notes" text,
	"lens" text,
	"focal_length" text,
	"t_stop" text,
	"filter" text,
	"matte_box" boolean,
	"iso" text,
	"fps" text,
	"shutter" text,
	"white_balance" text,
	"resolution" text,
	"codec" text,
	"aspect_ratio" text,
	"lut" text,
	"color_space" text,
	"vfx" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "camera_take_data_take_unit" UNIQUE("take_id","camera_unit_id")
);
--> statement-breakpoint
CREATE TABLE "camera_units" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"label" text NOT NULL,
	"model" text,
	"body_serial" text,
	"equipment_id" uuid,
	"operator" text,
	"focus_puller" text,
	"clapper" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "camera_units_production_label" UNIQUE("production_id","label")
);
--> statement-breakpoint
CREATE TABLE "sound_day_config" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"shooting_day_id" uuid NOT NULL,
	"sample_rate" text,
	"bit_depth" text,
	"frame_rate" text,
	"timecode_source" text,
	"drop_frame" boolean,
	"file_format" text,
	"poly" boolean,
	"media" text,
	"roll" text,
	"sound_mixer" text,
	"boom_operator" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "sound_day_config_day" UNIQUE("shooting_day_id")
);
--> statement-breakpoint
CREATE TABLE "sound_take_data" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"take_id" uuid NOT NULL,
	"status" "take_status",
	"circled" boolean DEFAULT false NOT NULL,
	"sound_roll" text,
	"file_name" text,
	"tc_start" text,
	"tc_end" text,
	"duration_sec" integer,
	"wild" boolean DEFAULT false NOT NULL,
	"room_tone" boolean DEFAULT false NOT NULL,
	"wild_lines" boolean DEFAULT false NOT NULL,
	"false_start" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "sound_take_data_take" UNIQUE("take_id")
);
--> statement-breakpoint
CREATE TABLE "sound_take_tracks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"take_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"name" text,
	"source" text,
	"equipment_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "sound_take_tracks_take_index" UNIQUE("take_id","index")
);
--> statement-breakpoint
CREATE TABLE "continuity_hair_makeup" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"scene_id" uuid,
	"setup_id" uuid,
	"take_id" uuid,
	"character" text NOT NULL,
	"state" text,
	"changes" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "continuity_hair_makeup_scope" CHECK (num_nonnulls(scene_id, setup_id, take_id) >= 1)
);
--> statement-breakpoint
CREATE TABLE "continuity_props" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"scene_id" uuid,
	"setup_id" uuid,
	"take_id" uuid,
	"name" text NOT NULL,
	"position" text,
	"state" text,
	"quantity" text,
	"interaction" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "continuity_props_scope" CHECK (num_nonnulls(scene_id, setup_id, take_id) >= 1)
);
--> statement-breakpoint
CREATE TABLE "continuity_set_dressing" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"scene_id" uuid,
	"setup_id" uuid,
	"take_id" uuid,
	"element" text NOT NULL,
	"position" text,
	"state" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "continuity_set_dressing_scope" CHECK (num_nonnulls(scene_id, setup_id, take_id) >= 1)
);
--> statement-breakpoint
CREATE TABLE "continuity_take_data" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"take_id" uuid NOT NULL,
	"status" "take_status",
	"selected" boolean DEFAULT false NOT NULL,
	"duration_sec" integer,
	"start_position" text,
	"end_position" text,
	"action" text,
	"movement" text,
	"direction" text,
	"entrances_exits" text,
	"eyeline" text,
	"object_interaction" text,
	"character_interaction" text,
	"dialogue_changes" text,
	"improvisation" text,
	"script_deviation" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "continuity_take_data_take" UNIQUE("take_id")
);
--> statement-breakpoint
CREATE TABLE "continuity_wardrobe" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"scene_id" uuid,
	"setup_id" uuid,
	"take_id" uuid,
	"character" text NOT NULL,
	"outfit" text,
	"accessories" text,
	"state" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "continuity_wardrobe_scope" CHECK (num_nonnulls(scene_id, setup_id, take_id) >= 1)
);
--> statement-breakpoint
CREATE TABLE "sync_log" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"operation" "sync_op" NOT NULL,
	"version" integer NOT NULL,
	"actor_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "production_member_departments" ADD CONSTRAINT "production_member_departments_member_id_production_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."production_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_members" ADD CONSTRAINT "production_members_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_members" ADD CONSTRAINT "production_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_members" ADD CONSTRAINT "production_members_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_members" ADD CONSTRAINT "production_members_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_members" ADD CONSTRAINT "production_members_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productions" ADD CONSTRAINT "productions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productions" ADD CONSTRAINT "productions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productions" ADD CONSTRAINT "productions_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shooting_days" ADD CONSTRAINT "shooting_days_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shooting_days" ADD CONSTRAINT "shooting_days_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shooting_days" ADD CONSTRAINT "shooting_days_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shooting_days" ADD CONSTRAINT "shooting_days_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setups" ADD CONSTRAINT "setups_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setups" ADD CONSTRAINT "setups_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setups" ADD CONSTRAINT "setups_shooting_day_id_shooting_days_id_fk" FOREIGN KEY ("shooting_day_id") REFERENCES "public"."shooting_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setups" ADD CONSTRAINT "setups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setups" ADD CONSTRAINT "setups_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setups" ADD CONSTRAINT "setups_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takes" ADD CONSTRAINT "takes_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takes" ADD CONSTRAINT "takes_setup_id_setups_id_fk" FOREIGN KEY ("setup_id") REFERENCES "public"."setups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takes" ADD CONSTRAINT "takes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takes" ADD CONSTRAINT "takes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takes" ADD CONSTRAINT "takes_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_assignments" ADD CONSTRAINT "equipment_assignments_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_assignments" ADD CONSTRAINT "equipment_assignments_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_assignments" ADD CONSTRAINT "equipment_assignments_shooting_day_id_shooting_days_id_fk" FOREIGN KEY ("shooting_day_id") REFERENCES "public"."shooting_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_assignments" ADD CONSTRAINT "equipment_assignments_member_id_production_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."production_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_assignments" ADD CONSTRAINT "equipment_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_assignments" ADD CONSTRAINT "equipment_assignments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_assignments" ADD CONSTRAINT "equipment_assignments_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_take_data" ADD CONSTRAINT "camera_take_data_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_take_data" ADD CONSTRAINT "camera_take_data_take_id_takes_id_fk" FOREIGN KEY ("take_id") REFERENCES "public"."takes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_take_data" ADD CONSTRAINT "camera_take_data_camera_unit_id_camera_units_id_fk" FOREIGN KEY ("camera_unit_id") REFERENCES "public"."camera_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_take_data" ADD CONSTRAINT "camera_take_data_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_take_data" ADD CONSTRAINT "camera_take_data_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_take_data" ADD CONSTRAINT "camera_take_data_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_units" ADD CONSTRAINT "camera_units_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_units" ADD CONSTRAINT "camera_units_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_units" ADD CONSTRAINT "camera_units_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_units" ADD CONSTRAINT "camera_units_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_units" ADD CONSTRAINT "camera_units_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound_day_config" ADD CONSTRAINT "sound_day_config_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound_day_config" ADD CONSTRAINT "sound_day_config_shooting_day_id_shooting_days_id_fk" FOREIGN KEY ("shooting_day_id") REFERENCES "public"."shooting_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound_day_config" ADD CONSTRAINT "sound_day_config_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound_day_config" ADD CONSTRAINT "sound_day_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound_day_config" ADD CONSTRAINT "sound_day_config_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound_take_data" ADD CONSTRAINT "sound_take_data_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound_take_data" ADD CONSTRAINT "sound_take_data_take_id_takes_id_fk" FOREIGN KEY ("take_id") REFERENCES "public"."takes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound_take_data" ADD CONSTRAINT "sound_take_data_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound_take_data" ADD CONSTRAINT "sound_take_data_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound_take_data" ADD CONSTRAINT "sound_take_data_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound_take_tracks" ADD CONSTRAINT "sound_take_tracks_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound_take_tracks" ADD CONSTRAINT "sound_take_tracks_take_id_takes_id_fk" FOREIGN KEY ("take_id") REFERENCES "public"."takes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound_take_tracks" ADD CONSTRAINT "sound_take_tracks_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound_take_tracks" ADD CONSTRAINT "sound_take_tracks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound_take_tracks" ADD CONSTRAINT "sound_take_tracks_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound_take_tracks" ADD CONSTRAINT "sound_take_tracks_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_hair_makeup" ADD CONSTRAINT "continuity_hair_makeup_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_hair_makeup" ADD CONSTRAINT "continuity_hair_makeup_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_hair_makeup" ADD CONSTRAINT "continuity_hair_makeup_setup_id_setups_id_fk" FOREIGN KEY ("setup_id") REFERENCES "public"."setups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_hair_makeup" ADD CONSTRAINT "continuity_hair_makeup_take_id_takes_id_fk" FOREIGN KEY ("take_id") REFERENCES "public"."takes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_hair_makeup" ADD CONSTRAINT "continuity_hair_makeup_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_hair_makeup" ADD CONSTRAINT "continuity_hair_makeup_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_hair_makeup" ADD CONSTRAINT "continuity_hair_makeup_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_props" ADD CONSTRAINT "continuity_props_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_props" ADD CONSTRAINT "continuity_props_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_props" ADD CONSTRAINT "continuity_props_setup_id_setups_id_fk" FOREIGN KEY ("setup_id") REFERENCES "public"."setups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_props" ADD CONSTRAINT "continuity_props_take_id_takes_id_fk" FOREIGN KEY ("take_id") REFERENCES "public"."takes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_props" ADD CONSTRAINT "continuity_props_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_props" ADD CONSTRAINT "continuity_props_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_props" ADD CONSTRAINT "continuity_props_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_set_dressing" ADD CONSTRAINT "continuity_set_dressing_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_set_dressing" ADD CONSTRAINT "continuity_set_dressing_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_set_dressing" ADD CONSTRAINT "continuity_set_dressing_setup_id_setups_id_fk" FOREIGN KEY ("setup_id") REFERENCES "public"."setups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_set_dressing" ADD CONSTRAINT "continuity_set_dressing_take_id_takes_id_fk" FOREIGN KEY ("take_id") REFERENCES "public"."takes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_set_dressing" ADD CONSTRAINT "continuity_set_dressing_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_set_dressing" ADD CONSTRAINT "continuity_set_dressing_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_set_dressing" ADD CONSTRAINT "continuity_set_dressing_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_take_data" ADD CONSTRAINT "continuity_take_data_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_take_data" ADD CONSTRAINT "continuity_take_data_take_id_takes_id_fk" FOREIGN KEY ("take_id") REFERENCES "public"."takes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_take_data" ADD CONSTRAINT "continuity_take_data_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_take_data" ADD CONSTRAINT "continuity_take_data_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_take_data" ADD CONSTRAINT "continuity_take_data_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_wardrobe" ADD CONSTRAINT "continuity_wardrobe_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_wardrobe" ADD CONSTRAINT "continuity_wardrobe_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_wardrobe" ADD CONSTRAINT "continuity_wardrobe_setup_id_setups_id_fk" FOREIGN KEY ("setup_id") REFERENCES "public"."setups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_wardrobe" ADD CONSTRAINT "continuity_wardrobe_take_id_takes_id_fk" FOREIGN KEY ("take_id") REFERENCES "public"."takes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_wardrobe" ADD CONSTRAINT "continuity_wardrobe_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_wardrobe" ADD CONSTRAINT "continuity_wardrobe_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_wardrobe" ADD CONSTRAINT "continuity_wardrobe_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_log" ADD CONSTRAINT "sync_log_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_log" ADD CONSTRAINT "sync_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scenes_production" ON "scenes" USING btree ("production_id");--> statement-breakpoint
CREATE INDEX "setups_production_day" ON "setups" USING btree ("production_id","shooting_day_id");--> statement-breakpoint
CREATE INDEX "takes_production_setup_number" ON "takes" USING btree ("production_id","setup_id","number");--> statement-breakpoint
CREATE INDEX "camera_take_data_production_take" ON "camera_take_data" USING btree ("production_id","take_id");--> statement-breakpoint
CREATE INDEX "sound_take_data_production_take" ON "sound_take_data" USING btree ("production_id","take_id");--> statement-breakpoint
CREATE INDEX "continuity_take_data_production_take" ON "continuity_take_data" USING btree ("production_id","take_id");--> statement-breakpoint
CREATE INDEX "sync_log_production_seq" ON "sync_log" USING btree ("production_id","seq");