CREATE TABLE "follow_requests" (
	"requester_id" text NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "follow_requests_requester_id_target_id_pk" PRIMARY KEY("requester_id","target_id"),
	CONSTRAINT "follow_requests_no_self" CHECK ("follow_requests"."requester_id" <> "follow_requests"."target_id")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "follow_requests" ADD CONSTRAINT "follow_requests_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_requests" ADD CONSTRAINT "follow_requests_target_id_user_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follow_requests_target_idx" ON "follow_requests" USING btree ("target_id","created_at");