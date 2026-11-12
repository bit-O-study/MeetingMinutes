CREATE TABLE "project_folder_assignments" (
	"owner_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"folder_id" uuid NOT NULL,
	CONSTRAINT "project_folder_assignments_owner_id_space_id_pk" PRIMARY KEY("owner_id","space_id")
);
--> statement-breakpoint
ALTER TABLE "project_folder_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_folders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_folders_name_check" CHECK (length(trim("project_folders"."name")) BETWEEN 1 AND 40 AND "project_folders"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "project_folders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_folder_assignments" ADD CONSTRAINT "project_folder_assignments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_folder_assignments" ADD CONSTRAINT "project_folder_assignments_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_folder_assignments" ADD CONSTRAINT "project_folder_assignments_folder_id_project_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."project_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_folders" ADD CONSTRAINT "project_folders_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_folder_assignments_folder_idx" ON "project_folder_assignments" USING btree ("folder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_folders_owner_name_idx" ON "project_folders" USING btree ("owner_id","name");