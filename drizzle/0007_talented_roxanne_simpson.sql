CREATE TABLE "daily_visits" (
	"day" date NOT NULL,
	"user_id" uuid NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_visits_day_user_id_pk" PRIMARY KEY("day","user_id")
);
--> statement-breakpoint
ALTER TABLE "daily_visits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "daily_visits" ADD CONSTRAINT "daily_visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;