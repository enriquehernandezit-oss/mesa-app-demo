import { type SQL, sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { restaurants } from './discovery'
import { rankings } from './ranking'

// Dish posts (Phase 6) — a photo the user took, attached to one of their own
// rankings. Linking to a ranking is REQUIRED (rankingId NOT NULL), so a dish is
// always evidence for a place someone has actually ranked. restaurantId is
// denormalized on purpose: "popular dishes at this place" is the hot query and
// this makes it one indexed read instead of a join through rankings.
//
// imageId holds either a client-resized data URL (dev / no Cloudinary) or a
// Cloudinary public id (prod). removedAt is soft-removal, mirroring vibe notes
// (App Store 1.2 — UGC must be removable).
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
    imageId: text('image_id').notNull(),
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
  ],
)
