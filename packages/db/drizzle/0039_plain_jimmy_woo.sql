ALTER TABLE "restaurants" ADD COLUMN "opening_hours" jsonb;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "open_minutes" "int4multirange";--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "google_sublocality" text;