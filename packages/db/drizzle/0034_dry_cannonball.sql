ALTER TABLE "neighborhoods" ADD COLUMN "country_code" text DEFAULT 'do' NOT NULL;--> statement-breakpoint
ALTER TABLE "neighborhoods" ADD COLUMN "city" text DEFAULT 'Santo Domingo' NOT NULL;--> statement-breakpoint
ALTER TABLE "neighborhoods" ADD COLUMN "listed" boolean DEFAULT true NOT NULL;