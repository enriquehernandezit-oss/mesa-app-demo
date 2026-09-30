CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"actor_id" text,
	"restaurant_id" uuid,
	"ranking_id" uuid,
	"comment_id" uuid,
	"dish_id" uuid,
	"event_id" uuid,
	"plan_id" uuid,
	"dish_list_id" uuid,
	"data" jsonb,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"read_at" timestamp,
	CONSTRAINT "notifications_user_dedupe_uq" UNIQUE("user_id","dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "locale" text DEFAULT 'es' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_ranking_id_rankings_id_fk" FOREIGN KEY ("ranking_id") REFERENCES "public"."rankings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_id_ranking_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."ranking_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_dish_list_id_dish_lists_id_fk" FOREIGN KEY ("dish_list_id") REFERENCES "public"."dish_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
-- Backfill: the last 60 days of what the Activity bell showed, so the inbox opens with
-- history instead of empty. Hand-written (drizzle-kit only generates the DDL above). The
-- dedupe keys are exactly the ones the live triggers write from now on, so a repeat of an
-- old event cannot land a second row, and read_at = now() so nobody wakes up to a badge
-- for things they already saw in Activity. Blocked and banned people are hidden on read,
-- not here.
INSERT INTO "notifications" ("user_id", "kind", "dedupe_key", "actor_id", "created_at", "read_at")
SELECT f."following_id", 'follow', 'follow:' || f."follower_id", f."follower_id", f."created_at", now()
FROM "follows" f
WHERE f."created_at" > now() - interval '60 days'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "notifications" ("user_id", "kind", "dedupe_key", "actor_id", "restaurant_id", "ranking_id", "created_at", "read_at")
SELECT r."user_id", 'cheers', 'cheers:' || c."ranking_id" || ':' || c."user_id", c."user_id", r."restaurant_id", c."ranking_id", c."created_at", now()
FROM "cheers" c
JOIN "rankings" r ON r."id" = c."ranking_id"
WHERE c."user_id" <> r."user_id" AND c."created_at" > now() - interval '60 days'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "notifications" ("user_id", "kind", "dedupe_key", "actor_id", "restaurant_id", "ranking_id", "comment_id", "data", "created_at", "read_at")
SELECT r."user_id", 'comment', 'comment:' || rc."id", rc."user_id", r."restaurant_id", rc."ranking_id", rc."id",
  jsonb_build_object('excerpt', CASE WHEN length(regexp_replace(rc."body", '\s+', ' ', 'g')) > 80
    THEN rtrim(left(regexp_replace(rc."body", '\s+', ' ', 'g'), 79)) || '…'
    ELSE regexp_replace(rc."body", '\s+', ' ', 'g') END),
  rc."created_at", now()
FROM "ranking_comments" rc
JOIN "rankings" r ON r."id" = rc."ranking_id"
WHERE rc."user_id" <> r."user_id" AND rc."removed_at" IS NULL AND rc."created_at" > now() - interval '60 days'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "notifications" ("user_id", "kind", "dedupe_key", "actor_id", "restaurant_id", "plan_id", "created_at", "read_at")
SELECT pi."user_id", 'plan_invite', 'plan_invite:' || pi."plan_id", p."host_id", coalesce(p."chosen_restaurant_id", po."restaurant_id"), pi."plan_id", pi."created_at", now()
FROM "plan_invites" pi
JOIN "plans" p ON p."id" = pi."plan_id"
LEFT JOIN "plan_options" po ON po."plan_id" = p."id" AND po."position" = 0
WHERE p."status" <> 'cancelled' AND pi."created_at" > now() - interval '60 days'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "notifications" ("user_id", "kind", "dedupe_key", "actor_id", "restaurant_id", "plan_id", "data", "created_at", "read_at")
SELECT p."host_id", 'plan_reply', 'plan_reply:' || pi."plan_id" || ':' || pi."user_id" || ':' || pi."reply"::text || ':', pi."user_id", coalesce(p."chosen_restaurant_id", po."restaurant_id"), pi."plan_id", jsonb_build_object('reply', pi."reply"::text), pi."replied_at", now()
FROM "plan_invites" pi
JOIN "plans" p ON p."id" = pi."plan_id"
LEFT JOIN "plan_options" po ON po."plan_id" = p."id" AND po."position" = 0
WHERE p."status" <> 'cancelled' AND pi."reply" IN ('going', 'maybe') AND pi."replied_at" > now() - interval '60 days'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "notifications" ("user_id", "kind", "dedupe_key", "actor_id", "restaurant_id", "event_id", "created_at", "read_at")
SELECT f."follower_id", 'event_going', 'event_going:' || er."event_id" || ':' || er."user_id", er."user_id", e."restaurant_id", er."event_id", er."updated_at", now()
FROM "event_rsvps" er
JOIN "events" e ON e."id" = er."event_id"
JOIN "follows" f ON f."following_id" = er."user_id"
WHERE er."status" = 'going' AND e."cancelled_at" IS NULL
  AND coalesce(e."ends_at", e."starts_at" + interval '3 hours') > now()
  AND er."updated_at" > now() - interval '60 days'
ON CONFLICT DO NOTHING;
