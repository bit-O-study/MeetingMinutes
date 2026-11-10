CREATE TABLE "meeting_responses" (
	"meeting_id" uuid NOT NULL,
	"day" date NOT NULL,
	"user_id" uuid NOT NULL,
	"answer" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_responses_meeting_id_day_user_id_pk" PRIMARY KEY("meeting_id","day","user_id"),
	CONSTRAINT "meeting_responses_answer_check" CHECK ("meeting_responses"."answer" IN ('yes','maybe','no'))
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"title" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'polling' NOT NULL,
	"span_days" integer DEFAULT 1 NOT NULL,
	"window_start" date NOT NULL,
	"window_end" date NOT NULL,
	"respond_by" timestamp with time zone,
	"created_by" uuid,
	"confirmed_start" date,
	"confirmed_end" date,
	"confirmed_from" text,
	"confirmed_to" text,
	"confirmed_at" timestamp with time zone,
	"note_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meetings_title_check" CHECK (length(trim("meetings"."title")) BETWEEN 1 AND 120 AND length("meetings"."location") <= 200 AND length("meetings"."memo") <= 4000),
	CONSTRAINT "meetings_status_check" CHECK ("meetings"."status" IN ('polling','confirmed','cancelled')),
	CONSTRAINT "meetings_span_check" CHECK ("meetings"."span_days" BETWEEN 1 AND 7),
	CONSTRAINT "meetings_window_check" CHECK ("meetings"."window_end" >= "meetings"."window_start" AND "meetings"."window_end" - "meetings"."window_start" <= 60 AND "meetings"."window_end" - "meetings"."window_start" + 1 >= "meetings"."span_days"),
	CONSTRAINT "meetings_confirmed_check" CHECK (("meetings"."status" = 'confirmed') = ("meetings"."confirmed_start" IS NOT NULL AND "meetings"."confirmed_end" IS NOT NULL AND "meetings"."confirmed_at" IS NOT NULL)
    AND ("meetings"."confirmed_start" IS NULL OR "meetings"."confirmed_end" >= "meetings"."confirmed_start")
    AND (("meetings"."confirmed_from" IS NULL AND "meetings"."confirmed_to" IS NULL) OR ("meetings"."confirmed_from" IS NOT NULL AND "meetings"."confirmed_to" IS NOT NULL AND "meetings"."confirmed_from" < "meetings"."confirmed_to")))
);
--> statement-breakpoint
ALTER TABLE "personal_planner_items" DROP CONSTRAINT "personal_planner_kind_check";--> statement-breakpoint
ALTER TABLE "personal_planner_items" ADD COLUMN "linked_item_id" uuid;--> statement-breakpoint
ALTER TABLE "personal_planner_items" ADD COLUMN "linked_meeting_id" uuid;--> statement-breakpoint
ALTER TABLE "meeting_responses" ADD CONSTRAINT "meeting_responses_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_responses" ADD CONSTRAINT "meeting_responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_responses_user_idx" ON "meeting_responses" USING btree ("user_id","meeting_id");--> statement-breakpoint
CREATE INDEX "meetings_space_status_idx" ON "meetings" USING btree ("space_id","status","window_start");--> statement-breakpoint
CREATE INDEX "meetings_confirmed_idx" ON "meetings" USING btree ("space_id","confirmed_start");--> statement-breakpoint
ALTER TABLE "personal_planner_items" ADD CONSTRAINT "personal_planner_items_linked_item_id_personal_planner_items_id_fk" FOREIGN KEY ("linked_item_id") REFERENCES "public"."personal_planner_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_planner_items" ADD CONSTRAINT "personal_planner_items_linked_meeting_id_meetings_id_fk" FOREIGN KEY ("linked_meeting_id") REFERENCES "public"."meetings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personal_planner_linked_meeting_idx" ON "personal_planner_items" USING btree ("linked_meeting_id");--> statement-breakpoint
CREATE INDEX "personal_planner_linked_item_idx" ON "personal_planner_items" USING btree ("linked_item_id");--> statement-breakpoint
ALTER TABLE "personal_planner_items" ADD CONSTRAINT "personal_planner_link_check" CHECK ("personal_planner_items"."kind" = 'task' OR ("personal_planner_items"."linked_item_id" IS NULL AND "personal_planner_items"."linked_meeting_id" IS NULL));--> statement-breakpoint
ALTER TABLE "personal_planner_items" ADD CONSTRAINT "personal_planner_kind_check" CHECK ("personal_planner_items"."kind" IN ('event','task') AND ("personal_planner_items"."kind" = 'task' OR ("personal_planner_items"."mode" IN ('fixed','range') AND "personal_planner_items"."done_at" IS NULL AND ("personal_planner_items"."mode" = 'fixed' OR "personal_planner_items"."start_date" IS NOT NULL))));