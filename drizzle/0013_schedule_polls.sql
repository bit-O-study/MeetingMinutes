CREATE TABLE "poll_excluded_days" (
	"poll_id" uuid NOT NULL,
	"day" date NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	CONSTRAINT "poll_excluded_days_poll_id_day_pk" PRIMARY KEY("poll_id","day"),
	CONSTRAINT "poll_excluded_days_reason_check" CHECK (length("poll_excluded_days"."reason") <= 40)
);
--> statement-breakpoint
ALTER TABLE "poll_excluded_days" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "poll_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"user_id" uuid,
	"display_name" text NOT NULL,
	"name_key" text NOT NULL,
	"edit_token_hash" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "poll_participants_name_check" CHECK (length(trim("poll_participants"."display_name")) BETWEEN 1 AND 20)
);
--> statement-breakpoint
ALTER TABLE "poll_participants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "poll_unavailable_days" (
	"participant_id" uuid NOT NULL,
	"day" date NOT NULL,
	CONSTRAINT "poll_unavailable_days_participant_id_day_pk" PRIMARY KEY("participant_id","day")
);
--> statement-breakpoint
ALTER TABLE "poll_unavailable_days" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"range_start" date NOT NULL,
	"range_end" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"confirmed_day" date,
	"result_visibility" text DEFAULT 'participants' NOT NULL,
	"respond_by" timestamp with time zone,
	"token" text NOT NULL,
	"token_hash" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"max_participants" integer DEFAULT 100 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "polls_text_check" CHECK (length(trim("polls"."title")) BETWEEN 1 AND 80 AND length("polls"."description") <= 1000),
	CONSTRAINT "polls_range_check" CHECK ("polls"."range_end" >= "polls"."range_start" AND "polls"."range_end" - "polls"."range_start" <= 59),
	CONSTRAINT "polls_status_check" CHECK ("polls"."status" IN ('open','closed','confirmed') AND "polls"."result_visibility" IN ('participants','owner')),
	CONSTRAINT "polls_confirmed_check" CHECK (("polls"."status" = 'confirmed') = ("polls"."confirmed_day" IS NOT NULL)),
	CONSTRAINT "polls_limits_check" CHECK ("polls"."max_participants" BETWEEN 1 AND 500 AND "polls"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "polls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "poll_excluded_days" ADD CONSTRAINT "poll_excluded_days_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_participants" ADD CONSTRAINT "poll_participants_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_participants" ADD CONSTRAINT "poll_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_unavailable_days" ADD CONSTRAINT "poll_unavailable_days_participant_id_poll_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."poll_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "poll_participants_name_idx" ON "poll_participants" USING btree ("poll_id","name_key");--> statement-breakpoint
CREATE UNIQUE INDEX "poll_participants_user_idx" ON "poll_participants" USING btree ("poll_id","user_id") WHERE "poll_participants"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "poll_participants_edit_idx" ON "poll_participants" USING btree ("edit_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "polls_token_hash_idx" ON "polls" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "polls_owner_idx" ON "polls" USING btree ("owner_id","created_at");