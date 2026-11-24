ALTER TABLE "polls" ADD COLUMN "food_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "restaurant" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "location" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_place_check" CHECK (length("polls"."food_type") <= 30 AND length("polls"."restaurant") <= 60 AND length("polls"."location") <= 100);