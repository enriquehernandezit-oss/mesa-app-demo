CREATE TYPE "public"."list_author_kind" AS ENUM('mesa', 'creator', 'venue');--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "curation_note" text;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "author_kind" "list_author_kind" DEFAULT 'mesa' NOT NULL;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "author_name" text;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "author_handle" text;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "author_avatar_id" text;--> statement-breakpoint

-- M15 mock data, hand-appended (not drizzle-kit generated): description +
-- curationNote + a byline for the 4 seeded lists, one of each authorKind so
-- the UI's three treatments ("por Mesa" / "por @handle" / a venue's own
-- name) all have a real row to render against. seed-curation.ts's LISTS
-- array mirrors this exactly — that script deletes+rebuilds `lists` from
-- scratch, so without the same fields there a reseed would blank these out.
-- Every creator/venue name below is fictional, never a real person or
-- business — same rule the plan itself calls out.
UPDATE "lists" SET
  "description" = 'Nuestros rincones favoritos para una noche de pasta fresca y vino tinto.',
  "curation_note" = 'Elegidos a mano por Grecia entre los spots italianos mejor puntuados por la comunidad Mesa.',
  "author_kind" = 'creator',
  "author_name" = 'Grecia Duval',
  "author_handle" = 'greciaeats'
WHERE "slug" = 'la-dolce-vita';--> statement-breakpoint

UPDATE "lists" SET
  "description" = 'Piantini no se duerme — estos son los lugares que se quedan animados hasta tarde.',
  "curation_note" = 'Ordenados por la puntuación de tus amigos entre los spots de Piantini con más actividad nocturna.'
WHERE "slug" = 'piantini-after-dark';--> statement-breakpoint

UPDATE "lists" SET
  "description" = 'Nuestra selección editorial de los mejores lugares de Santo Domingo este año.',
  "curation_note" = 'Los spots con mejor puntuación promedio en todo el catálogo de Mesa, revisados por el equipo.'
WHERE "slug" = 'mesa-best-2026';--> statement-breakpoint

UPDATE "lists" SET
  "description" = 'Los platos de siempre, como los prepara la generación que nos enseñó a cocinar.',
  "curation_note" = 'Una selección de Comedor Doña Chana — sazón criolla sin atajos, desde 1987.',
  "author_kind" = 'venue',
  "author_name" = 'Comedor Doña Chana'
WHERE "slug" = 'criolla-clasica';