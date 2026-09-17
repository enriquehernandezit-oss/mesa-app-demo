ALTER TABLE "user" ADD COLUMN "phone_hash" text;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_phone_hash_unique" UNIQUE("phone_hash");