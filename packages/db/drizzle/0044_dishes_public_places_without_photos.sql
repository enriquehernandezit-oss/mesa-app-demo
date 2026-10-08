-- Two rules, applied to everything that exists:
--
-- 1. A place has no picture of its own. Mesa shows its name card instead, and members' dish photos live
--    on the place's page, not as its profile picture. Migration 0043 had set each cover to the best public
--    dish photo; that is undone here, and nothing sets a place's cover from now on.
-- 2. Dishes and their photos are public: anyone signed in sees them on the place's page, whether the
--    poster's account is public or private. The friends-only choice is gone, so every dish is made public.
--
-- A featured list's header picture that was copied from a place's stock photo (a seed path) goes too.
--
-- Idempotent: running it again changes nothing.
UPDATE "restaurants" SET "cover_image_id" = NULL WHERE "cover_image_id" IS NOT NULL;
UPDATE "dishes" SET "visibility" = 'public' WHERE "visibility" <> 'public';
UPDATE "lists" SET "cover_image_id" = NULL WHERE "cover_image_id" LIKE '/restaurants/%';
ALTER TABLE "dishes" ALTER COLUMN "visibility" SET DEFAULT 'public';
