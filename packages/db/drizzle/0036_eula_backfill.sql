-- The API now requires an accepted EULA before a member can post, rank, comment or upload
-- (middleware/session.ts requireEula). Members who already ranked a place got through onboarding
-- before the check existed, so they are recorded as having accepted when they joined rather than
-- locked out of what they already use. Members with no ranking and no acceptance are unchanged:
-- onboarding asks them. Safe to run twice.
UPDATE "user"
SET "eula_accepted_at" = "created_at"
WHERE "eula_accepted_at" IS NULL
  AND EXISTS (SELECT 1 FROM "rankings" WHERE "rankings"."user_id" = "user"."id");
