CREATE TABLE "invite_redemptions" (
	"code" text NOT NULL,
	"inviter_id" text NOT NULL,
	"invited_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invite_no_self" CHECK ("invite_redemptions"."inviter_id" <> "invite_redemptions"."invited_user_id")
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"code" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invite_redemptions" ADD CONSTRAINT "invite_redemptions_code_invites_code_fk" FOREIGN KEY ("code") REFERENCES "public"."invites"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_redemptions" ADD CONSTRAINT "invite_redemptions_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_redemptions" ADD CONSTRAINT "invite_redemptions_invited_user_id_user_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invite_redemptions_user_idx" ON "invite_redemptions" USING btree ("invited_user_id");--> statement-breakpoint
CREATE INDEX "invite_redemptions_inviter_idx" ON "invite_redemptions" USING btree ("inviter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_user_idx" ON "invites" USING btree ("user_id");