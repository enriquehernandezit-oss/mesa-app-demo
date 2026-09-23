CREATE TABLE "user_favorite_neighborhoods" (
	"user_id" text NOT NULL,
	"neighborhood_id" uuid NOT NULL,
	CONSTRAINT "user_favorite_neighborhoods_user_id_neighborhood_id_pk" PRIMARY KEY("user_id","neighborhood_id")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "instagram_handle" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "favorite_cuisines" text[];--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "birthday" date;--> statement-breakpoint
ALTER TABLE "user_favorite_neighborhoods" ADD CONSTRAINT "user_favorite_neighborhoods_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorite_neighborhoods" ADD CONSTRAINT "user_favorite_neighborhoods_neighborhood_id_neighborhoods_id_fk" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhoods"("id") ON DELETE cascade ON UPDATE no action;