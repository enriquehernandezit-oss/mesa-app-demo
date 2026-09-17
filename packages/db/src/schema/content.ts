import { type SQL, sql } from 'drizzle-orm'
import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { restaurants } from './discovery'
import { rankings } from './ranking'

// The closed dish-category taxonomy (M11) — seeded by migration, see
// packages/db/src/dishCategories.ts for the full list and the keyword-guess
// matcher. `id` is the slug itself (e.g. 'pasta', 'otro'), not a uuid: it's a
// small closed set the client already speaks in slugs, and a slug PK reads
// directly in SQL/analytics with no join needed to get a stable key.
export const dishCategories = pgTable('dish_categories', {
  id: text('id').primaryKey(),
  group: text('group').notNull(),
  nameEs: text('name_es').notNull(),
  sortOrder: integer('sort_order').notNull(),
  active: boolean('active').notNull().default(true),
})

// Dish posts (Phase 6, categorized + photo-optional as of M11) — evidence
// attached to one of the user's own rankings. Linking to a ranking is
// REQUIRED (rankingId NOT NULL), so a dish is always evidence for a place
// someone has actually ranked. restaurantId is denormalized on purpose:
// "popular dishes at this place" is the hot query and this makes it one
// indexed read instead of a join through rankings.
//
// imageId holds either a client-resized data URL (dev / no Cloudinary) or a
// Cloudinary public id (prod) — nullable as of M11: a dish with a name and
// category but no photo is a first-class row, not a broken one (this is also
// what a `rankings.favoriteDish` string becomes once it's backfilled into the
// dishes table). removedAt is soft-removal, mirroring vibe notes (App Store
// 1.2 — UGC must be removable).
export const dishes = pgTable(
  'dishes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    rankingId: uuid('ranking_id')
      .notNull()
      .references(() => rankings.id, { onDelete: 'cascade' }),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Normalized for search — see restaurants.nameKey in discovery.ts for
    // why this is a generated column rather than an expression index.
    nameKey: text('name_key').generatedAlwaysAs(
      (): SQL => sql`mesa_norm(${sql.identifier('name')})`,
    ),
    caption: text('caption'),
    imageId: text('image_id'),
    // Nullable until the M11 backfill is confirmed against production and a
    // follow-up migration tightens this to NOT NULL (see dishCategories.ts).
    categoryId: text('category_id').references(() => dishCategories.id),
    // The one-tap sentiment captured alongside the dish in the rank flow —
    // raw material for the next milestone's dish ranking, not surfaced in any
    // UI yet beyond the tap itself. loved | fine | disliked.
    sentiment: text('sentiment'),
    // Capture-time grain treatment (a Cloudinary transform in prod).
    grain: text('grain').notNull().default('none'), // candlelit | daylight | none
    visibility: text('visibility').notNull().default('friends'), // friends | public
    removedAt: timestamp('removed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('dishes_restaurant_idx').on(t.restaurantId, t.createdAt),
    index('dishes_user_idx').on(t.userId, t.createdAt),
    index('dishes_ranking_idx').on(t.rankingId),
    index('dishes_name_key_trgm_idx').using('gin', sql`${t.nameKey} gin_trgm_ops`),
    // The repeat-dish nudge (M20) counts a member's own distinct restaurants
    // per nameKey on every dish POST — this is that query's index.
    index('dishes_user_name_key_idx').on(t.userId, t.nameKey),
  ],
)
