ALTER TYPE "public"."report_target_type" ADD VALUE 'comment';--> statement-breakpoint
CREATE TABLE "ranking_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ranking_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"removed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "ranking_comments" ADD CONSTRAINT "ranking_comments_ranking_id_rankings_id_fk" FOREIGN KEY ("ranking_id") REFERENCES "public"."rankings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_comments" ADD CONSTRAINT "ranking_comments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ranking_comments_ranking_created_idx" ON "ranking_comments" USING btree ("ranking_id","created_at");