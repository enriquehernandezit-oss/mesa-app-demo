ALTER TABLE "user" ADD COLUMN "banned_at" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_moderator" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vibe_notes" ADD COLUMN "removed_at" timestamp;