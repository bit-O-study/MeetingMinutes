CREATE TABLE "project_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "source_message_id" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "original_body" text;--> statement-breakpoint
ALTER TABLE "project_messages" ADD CONSTRAINT "project_messages_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_messages" ADD CONSTRAINT "project_messages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_messages_space_created_idx" ON "project_messages" USING btree ("space_id","created_at");--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_source_message_id_project_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."project_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "issues_source_message_idx" ON "issues" USING btree ("source_message_id");