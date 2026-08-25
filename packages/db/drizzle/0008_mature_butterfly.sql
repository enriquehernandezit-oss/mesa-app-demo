-- Hand-edited after `drizzle-kit generate`. The auto-generated SQL was
-- correct but needed reordering + backfill logic drizzle-kit can't derive:
--   1. mesa_norm() must exist before the three GENERATED columns below
--      reference it (drizzle-kit doesn't know about the function at all —
--      it isn't a schema.ts concept).
--   2. neighborhoods.lat/lng/radius_m were emitted as bare `ADD COLUMN ...
--      NOT NULL`, which fails on this table's 7 existing rows. Split into
--      add-nullable -> backfill -> set-not-null.
--   3. Classifying/repairing the existing restaurants rows.
--
-- name_key/cuisine_key/dishes.name_key are GENERATED columns, not expression
-- indexes over a raw mesa_norm(...) call, deliberately: an expression index
-- BUILD against a table that already has rows fails with "text search
-- dictionary unaccent does not exist" when run in the same transaction as
-- CREATE EXTENSION unaccent (confirmed by reproducing it directly — a real
-- Postgres quirk where index-build expression evaluation doesn't see the
-- extension's dictionary catalog entry yet, even though a plain SELECT or a
-- GENERATED column population, in the very same transaction, both do). Since
-- drizzle's migrator always wraps every pending migration into ONE
-- transaction (see pg-core/dialect.js's migrate()), splitting this across
-- migration files doesn't help — GENERATED column + a plain index on that
-- column sidesteps the bug entirely instead of working around it.

-- pg_trgm: trigram similarity + the GIN opclasses the search rewrite relies
-- on. unaccent: backs mesa_norm below.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint

-- Normalizes a name for search: lowercased, accents stripped, so "Serrallés"
-- and "serralles" match. Must be IMMUTABLE to back a generated column or an
-- index — the built-in one-argument unaccent(text) is only STABLE (it reads
-- search_path at call time), so this pins the two-argument form to the
-- extension's own default dictionary, which is fixed and always present once
-- unaccent is installed.
--
-- LANGUAGE plpgsql, not sql: with LANGUAGE sql, Postgres inlines this
-- function's body wherever it's called, and inlining it re-resolves the
-- 'unaccent'::regdictionary literal at a point where the lookup can fail
-- (the same class of issue as the expression-index bug above, one layer
-- earlier). plpgsql is never inlined by the planner, so the cast resolves at
-- normal runtime instead.
CREATE OR REPLACE FUNCTION mesa_norm(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
BEGIN
  RETURN lower(unaccent('unaccent'::regdictionary, input));
END;
$$;
--> statement-breakpoint

CREATE TYPE "public"."geo_precision" AS ENUM('exact', 'sector');--> statement-breakpoint
CREATE TYPE "public"."restaurant_source" AS ENUM('seed', 'foursquare', 'member');--> statement-breakpoint

-- neighborhoods: centroids, nullable first (7 populated rows already exist).
-- Values below are the AVERAGE of each sector's own already-seeded restaurant
-- coordinates (packages/db/src/seed-data.ts / seed-extra.ts /
-- seed-add-restaurants.ts) — computed from this app's own "approximate real
-- coordinates" data, not guessed. radius_m is 1.5x the empirical max distance
-- from that centroid to any of the sector's own points (min 400m) — a jitter
-- bound for member-added rows (see MapScreen's project()), not a precise
-- district boundary. Evaristo Morales' radius was capped down from its raw
-- formula value (2020m, off a thin 3-point sample) to a sector-scale 700m.
ALTER TABLE "neighborhoods" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "neighborhoods" ADD COLUMN "lng" double precision;--> statement-breakpoint
ALTER TABLE "neighborhoods" ADD COLUMN "radius_m" integer;--> statement-breakpoint

UPDATE "neighborhoods" SET "lat" = 18.4688, "lng" = -69.9374, "radius_m" = 623 WHERE "slug" = 'piantini';--> statement-breakpoint
UPDATE "neighborhoods" SET "lat" = 18.4728, "lng" = -69.9272, "radius_m" = 902 WHERE "slug" = 'naco';--> statement-breakpoint
UPDATE "neighborhoods" SET "lat" = 18.4550, "lng" = -69.9417, "radius_m" = 400 WHERE "slug" = 'bella-vista';--> statement-breakpoint
UPDATE "neighborhoods" SET "lat" = 18.4630, "lng" = -69.9292, "radius_m" = 400 WHERE "slug" = 'serralles';--> statement-breakpoint
UPDATE "neighborhoods" SET "lat" = 18.4739, "lng" = -69.8849, "radius_m" = 743 WHERE "slug" = 'zona-colonial';--> statement-breakpoint
UPDATE "neighborhoods" SET "lat" = 18.4659, "lng" = -69.9103, "radius_m" = 775 WHERE "slug" = 'gazcue';--> statement-breakpoint
UPDATE "neighborhoods" SET "lat" = 18.4719, "lng" = -69.9430, "radius_m" = 700 WHERE "slug" = 'evaristo-morales';--> statement-breakpoint

-- Fail loudly (not with a confusing generic NOT NULL violation below) if a
-- future edit adds an 8th neighborhood row without extending this migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "neighborhoods" WHERE "lat" IS NULL) THEN
    RAISE EXCEPTION 'neighborhoods: % row(s) missing a centroid backfill — add it to migration 0008',
      (SELECT count(*) FROM "neighborhoods" WHERE "lat" IS NULL);
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "neighborhoods" ALTER COLUMN "lat" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "neighborhoods" ALTER COLUMN "lng" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "neighborhoods" ALTER COLUMN "radius_m" SET NOT NULL;--> statement-breakpoint

-- restaurants: the catalog columns. name_key/cuisine_key's mesa_norm(...)
-- calls resolve now that the function exists (above); geo_precision/source
-- get a real default so they're safe as single ADD COLUMN NOT NULL
-- statements even on this table's existing rows.
ALTER TABLE "restaurants" ADD COLUMN "name_key" text GENERATED ALWAYS AS (mesa_norm("name")) STORED;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "cuisine_key" text GENERATED ALWAYS AS (mesa_norm("cuisine")) STORED;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "geo_precision" "geo_precision" DEFAULT 'exact' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "source" "restaurant_source" DEFAULT 'seed' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "locality" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "fsq_place_id" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "google_place_id" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "source_refreshed_at" timestamp;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "closed_at" timestamp;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "removed_at" timestamp;--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "name_key" text GENERATED ALWAYS AS (mesa_norm("name")) STORED;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "restaurants_fsq_place_id_uq" ON "restaurants" USING btree ("fsq_place_id") WHERE "restaurants"."fsq_place_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "restaurants_google_place_id_uq" ON "restaurants" USING btree ("google_place_id") WHERE "restaurants"."google_place_id" is not null;--> statement-breakpoint
CREATE INDEX "restaurants_name_key_trgm_idx" ON "restaurants" USING gin ("name_key" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "restaurants_cuisine_key_trgm_idx" ON "restaurants" USING gin ("cuisine_key" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "dishes_name_key_trgm_idx" ON "dishes" USING gin ("name_key" gin_trgm_ops);--> statement-breakpoint

-- Classify the existing rows. is_demo already distinguishes the 49 seeded
-- restaurants (is_demo=true) from any member-added ones (is_demo=false) —
-- the old POST /restaurants handler stamped every member row onto the same
-- hardcoded Santo Domingo city-centre point (18.4801, -69.9422), so those
-- rows are also geo_precision='sector' by construction, not a real geocode.
UPDATE "restaurants" SET "source" = 'member', "geo_precision" = 'sector' WHERE NOT "is_demo";--> statement-breakpoint

-- Move those rows off the shared city-centre point onto their own sector's
-- centroid, so they stop stacking on one map pixel. This only fixes WHICH
-- sector they land in; per-restaurant jitter within that sector (so several
-- member rows in the same sector don't stack on each other either) happens
-- client-side in MapScreen's project(), keyed off geo_precision.
UPDATE "restaurants" r
SET "lat" = n."lat", "lng" = n."lng"
FROM "neighborhoods" n
WHERE r."neighborhood_id" = n."id" AND r."geo_precision" = 'sector';
