ALTER TABLE "restaurants" ADD COLUMN "price_tier" integer;--> statement-breakpoint
ALTER TABLE "rankings" ADD COLUMN "tags" text[];--> statement-breakpoint
ALTER TABLE "rankings" ADD COLUMN "favorite_dish" text;