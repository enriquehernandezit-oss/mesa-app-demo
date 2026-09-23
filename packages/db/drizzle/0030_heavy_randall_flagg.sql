CREATE TABLE "friend_suggestion_dismissals" (
	"user_id" text NOT NULL,
	"dismissed_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "friend_suggestion_dismissals_user_id_dismissed_user_id_pk" PRIMARY KEY("user_id","dismissed_user_id"),
	CONSTRAINT "friend_suggestion_dismissals_no_self" CHECK ("friend_suggestion_dismissals"."user_id" <> "friend_suggestion_dismissals"."dismissed_user_id")
);
--> statement-breakpoint
ALTER TABLE "friend_suggestion_dismissals" ADD CONSTRAINT "friend_suggestion_dismissals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_suggestion_dismissals" ADD CONSTRAINT "friend_suggestion_dismissals_dismissed_user_id_user_id_fk" FOREIGN KEY ("dismissed_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "friend_suggestion_dismissals_dismissed_idx" ON "friend_suggestion_dismissals" USING btree ("dismissed_user_id");