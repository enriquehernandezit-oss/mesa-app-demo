-- One live dish per name on a ranking. Quick re-posts of the same dish could race past
-- POST /dishes's check-then-insert and leave two live rows; the unique index below refuses that
-- from now on, but it cannot be created while any such pair exists. So first retire the extra
-- copies: of each pair keep the one with a photo, else the oldest, and soft-remove (removed_at)
-- the rest — kept for audit, gone from every read, exactly as a moderator removal is.
-- Safe to run twice (a second run finds nothing).
UPDATE "dishes" SET "removed_at" = now()
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (
      PARTITION BY "ranking_id", "name_key"
      ORDER BY ("image_id" IS NULL), "created_at", "id"
    ) AS "rn"
    FROM "dishes"
    WHERE "removed_at" IS NULL
  ) ranked
  WHERE "rn" > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX "dishes_ranking_name_live_uq" ON "dishes" USING btree ("ranking_id","name_key") WHERE "dishes"."removed_at" is null;
