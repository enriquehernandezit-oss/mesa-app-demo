import { doublePrecision, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core'

// The target zones (reference/enum-like). A table, not a pgEnum, because
// restaurants and users FK to it and we want a display name alongside the slug.
// Seeded with the five neighborhoods from CLAUDE.md.
// Kept import-free so both auth and discovery modules can reference it without a
// circular dependency.
export const neighborhoods = pgTable('neighborhoods', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(), // piantini, naco, bella-vista, serralles, zona-colonial
  name: text('name').notNull(),
  // A centroid for the sector, not a single street address — computed from the
  // seeded restaurants' own coordinates (see migration 0009's backfill), not
  // guessed. Used for (a) the RankAPlace "Cerca" fallback sort before a
  // geocode exists, (b) placing a member-added restaurant on SOMETHING better
  // than the city center, jittered by radiusM so they don't all stack on one
  // pixel (see MapScreen's project()).
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  radiusM: integer('radius_m').notNull(),
})
