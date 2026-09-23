CREATE TABLE "dish_cheers" (
	"user_id" text NOT NULL,
	"dish_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dish_cheers_user_id_dish_id_pk" PRIMARY KEY("user_id","dish_id")
);
--> statement-breakpoint
ALTER TABLE "dish_cheers" ADD CONSTRAINT "dish_cheers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_cheers" ADD CONSTRAINT "dish_cheers_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dish_cheers_dish_idx" ON "dish_cheers" USING btree ("dish_id");