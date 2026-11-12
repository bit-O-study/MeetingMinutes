-- Hand-edited: token_hash is added nullable, backfilled with sha256(token) for existing rows, then set NOT NULL.
-- RLS is enabled with no policies: the app connects as the table owner (postgres), which bypasses RLS;
-- anon/authenticated (Supabase Data API) get no rows.
-- sessions are NOT rewritten here: the app hashes legacy plaintext rows on first lookup (lib/token-store.ts).
CREATE TABLE "space_removals" (
	"space_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"removed_by" uuid,
	"removed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_removals_space_id_user_id_pk" PRIMARY KEY("space_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "space_removals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auth_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invite_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "note_docs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "note_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "password_credentials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "share_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "space_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "spaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verification_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "invite_links_token_idx";--> statement-breakpoint
DROP INDEX "share_links_token_idx";--> statement-breakpoint
ALTER TABLE "invite_links" ADD COLUMN "token_hash" text;--> statement-breakpoint
UPDATE "invite_links" SET "token_hash" = encode(sha256(convert_to("token", 'UTF8')), 'hex') WHERE "token_hash" IS NULL;--> statement-breakpoint
ALTER TABLE "invite_links" ALTER COLUMN "token_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "share_links" ADD COLUMN "token_hash" text;--> statement-breakpoint
UPDATE "share_links" SET "token_hash" = encode(sha256(convert_to("token", 'UTF8')), 'hex') WHERE "token_hash" IS NULL;--> statement-breakpoint
ALTER TABLE "share_links" ALTER COLUMN "token_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "space_removals" ADD CONSTRAINT "space_removals_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_removals" ADD CONSTRAINT "space_removals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_removals" ADD CONSTRAINT "space_removals_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invite_links_token_hash_idx" ON "invite_links" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_token_hash_idx" ON "share_links" USING btree ("token_hash");