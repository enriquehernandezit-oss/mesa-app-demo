-- A place's picture is now a member's dish photo, nothing else. Until now the cover was whatever the
-- catalog carried (the seed's stock art, an import), which is not Mesa's to show and not from anyone who
-- went. Set every place's cover to its best dish photo — the most cheered, then the newest — among dishes
-- their owner marked public, on a public account that is not banned; a place with no such photo ends
-- with no cover and shows Mesa's own. The API keeps this in step from here on (apps/api/src/lib/placeCover.ts,
-- the same rule). Idempotent: running it again leaves the same covers.
UPDATE "restaurants" SET "cover_image_id" = (
  SELECT d."image_id"
  FROM "dishes" d
  INNER JOIN "user" u ON u."id" = d."user_id"
  WHERE d."restaurant_id" = "restaurants"."id"
    AND d."removed_at" IS NULL
    AND d."image_id" IS NOT NULL
    AND d."visibility" = 'public'
    AND u."is_private" = false
    AND u."banned_at" IS NULL
  ORDER BY (SELECT count(*) FROM "dish_cheers" c WHERE c."dish_id" = d."id") DESC, d."created_at" DESC
  LIMIT 1
)
WHERE "cover_image_id" IS NOT NULL OR EXISTS (
  SELECT 1 FROM "dishes" d2 WHERE d2."restaurant_id" = "restaurants"."id" AND d2."image_id" IS NOT NULL
);
