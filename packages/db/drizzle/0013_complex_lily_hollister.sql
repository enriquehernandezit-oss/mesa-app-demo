CREATE TYPE "public"."plan_reply" AS ENUM('pending', 'going', 'maybe', 'declined');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('open', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TABLE "plan_invites" (
	"plan_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"reply" "plan_reply" DEFAULT 'pending' NOT NULL,
	"vote_restaurant_id" uuid,
	"replied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plan_invites_plan_id_user_id_pk" PRIMARY KEY("plan_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "plan_options" (
	"plan_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "plan_options_plan_id_restaurant_id_pk" PRIMARY KEY("plan_id","restaurant_id")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" text NOT NULL,
	"note" text,
	"starts_at" timestamp with time zone NOT NULL,
	"status" "plan_status" DEFAULT 'open' NOT NULL,
	"chosen_restaurant_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_invites" ADD CONSTRAINT "plan_invites_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_invites" ADD CONSTRAINT "plan_invites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_invites" ADD CONSTRAINT "plan_invites_vote_restaurant_id_restaurants_id_fk" FOREIGN KEY ("vote_restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_options" ADD CONSTRAINT "plan_options_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_options" ADD CONSTRAINT "plan_options_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_host_id_user_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_chosen_restaurant_id_restaurants_id_fk" FOREIGN KEY ("chosen_restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_invites_user_idx" ON "plan_invites" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "plan_options_restaurant_idx" ON "plan_options" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "plans_host_idx" ON "plans" USING btree ("host_id");