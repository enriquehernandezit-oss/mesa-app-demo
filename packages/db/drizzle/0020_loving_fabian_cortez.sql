CREATE TABLE "dish_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dish_list_items_list_restaurant_uq" UNIQUE("list_id","restaurant_id")
);
--> statement-breakpoint
CREATE TABLE "dish_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name_key" text NOT NULL,
	"label" text NOT NULL,
	"ranked_at" timestamp,
	"dismissed_at" timestamp,
	"pushed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dish_lists_user_name_key_uq" UNIQUE("user_id","name_key")
);
--> statement-breakpoint
ALTER TABLE "dish_list_items" ADD CONSTRAINT "dish_list_items_list_id_dish_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."dish_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_list_items" ADD CONSTRAINT "dish_list_items_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_lists" ADD CONSTRAINT "dish_lists_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dish_list_items_list_idx" ON "dish_list_items" USING btree ("list_id","position");--> statement-breakpoint
CREATE INDEX "dish_lists_due_idx" ON "dish_lists" USING btree ("ranked_at","dismissed_at","pushed_at");--> statement-breakpoint
CREATE INDEX "dishes_user_name_key_idx" ON "dishes" USING btree ("user_id","name_key");