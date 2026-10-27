CREATE TABLE "personal_planner_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"mode" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"scheduled_date" date,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_planner_kind_check" CHECK ("personal_planner_items"."kind" IN ('event','task') AND ("personal_planner_items"."kind" = 'task' OR ("personal_planner_items"."mode" = 'fixed' AND "personal_planner_items"."done_at" IS NULL))),
	CONSTRAINT "personal_planner_title_check" CHECK (length(trim("personal_planner_items"."title")) BETWEEN 1 AND 160 AND length("personal_planner_items"."memo") <= 4000 AND "personal_planner_items"."version" > 0),
	CONSTRAINT "personal_planner_schedule_check" CHECK ((
    ("personal_planner_items"."mode" = 'none' AND "personal_planner_items"."start_date" IS NULL AND "personal_planner_items"."end_date" IS NULL AND "personal_planner_items"."scheduled_date" IS NULL AND "personal_planner_items"."starts_at" IS NULL AND "personal_planner_items"."ends_at" IS NULL AND NOT "personal_planner_items"."all_day") OR
    ("personal_planner_items"."mode" = 'range' AND "personal_planner_items"."end_date" IS NOT NULL AND ("personal_planner_items"."start_date" IS NULL OR "personal_planner_items"."start_date" <= "personal_planner_items"."end_date") AND "personal_planner_items"."scheduled_date" IS NULL AND "personal_planner_items"."starts_at" IS NULL AND "personal_planner_items"."ends_at" IS NULL AND NOT "personal_planner_items"."all_day") OR
    ("personal_planner_items"."mode" = 'fixed' AND "personal_planner_items"."scheduled_date" IS NOT NULL AND "personal_planner_items"."start_date" IS NULL AND "personal_planner_items"."end_date" IS NULL AND
      (("personal_planner_items"."all_day" AND "personal_planner_items"."starts_at" IS NULL AND "personal_planner_items"."ends_at" IS NULL) OR
       (NOT "personal_planner_items"."all_day" AND "personal_planner_items"."starts_at" IS NOT NULL AND "personal_planner_items"."ends_at" IS NOT NULL AND "personal_planner_items"."ends_at" > "personal_planner_items"."starts_at" AND ("personal_planner_items"."starts_at" AT TIME ZONE 'Asia/Seoul')::date = "personal_planner_items"."scheduled_date" AND ("personal_planner_items"."ends_at" AT TIME ZONE 'Asia/Seoul')::date = "personal_planner_items"."scheduled_date")))))
);
--> statement-breakpoint
ALTER TABLE "personal_planner_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "personal_planner_items" ADD CONSTRAINT "personal_planner_items_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personal_planner_owner_idx" ON "personal_planner_items" USING btree ("owner_id","kind","done_at");--> statement-breakpoint
CREATE INDEX "personal_planner_calendar_idx" ON "personal_planner_items" USING btree ("owner_id","scheduled_date");--> statement-breakpoint
CREATE INDEX "personal_planner_range_idx" ON "personal_planner_items" USING btree ("owner_id","end_date");