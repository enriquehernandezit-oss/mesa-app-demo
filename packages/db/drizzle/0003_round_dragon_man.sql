CREATE TABLE "cheers" (
	"user_id" text NOT NULL,
	"ranking_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cheers_user_id_ranking_id_pk" PRIMARY KEY("user_id","ranking_id")
);
--> statement-breakpoint
ALTER TABLE "cheers" ADD CONSTRAINT "cheers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheers" ADD CONSTRAINT "cheers_ranking_id_rankings_id_fk" FOREIGN KEY ("ranking_id") REFERENCES "public"."rankings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cheers_ranking_idx" ON "cheers" USING btree ("ranking_id");