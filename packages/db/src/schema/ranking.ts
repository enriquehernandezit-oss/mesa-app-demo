import {
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { restaurants } from './discovery'

// A user's ordered list of places they've been. `position` (dense 1..n within a
// user) is the source of truth from the pairwise flow; `score` is the derived
// 0–100 value shown next to the rank. Inserting a new place is a binary search
// over the existing list (~log2 n comparisons), then a reposition — the schema
// supports that; the flow lands in M2/M3.
//
// No unique(userId, position): a reorder shifts many positions and a per-row
// unique check would fight the transaction. Uniqueness of position is enforced
// in application logic; the (userId, position) index keeps ordered reads cheap.
export const rankings = pgTable(
  'rankings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    score: doublePrecision('score').notNull(),
    // Beli-style extras: short tags ("date night", "terraza") and the dish worth
    // ordering. Both optional, set alongside the vibe note.
    tags: text('tags').array(),
    favoriteDish: text('favorite_dish'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('rankings_user_restaurant_uq').on(t.userId, t.restaurantId),
    index('rankings_user_position_idx').on(t.userId, t.position),
    index('rankings_restaurant_idx').on(t.restaurantId), // who ranked this place
  ],
)

// A "cheers" (🥂) — Mesa's reaction to a friend's ranking. One per user per
// ranking; deleting either side cascades. The feed shows the count.
export const cheers = pgTable(
  'cheers',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    rankingId: uuid('ranking_id')
      .notNull()
      .references(() => rankings.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.rankingId] }),
    index('cheers_ranking_idx').on(t.rankingId),
  ],
)

// The "why" — one short line attached to a ranking. This is Mesa's identity
// (vibe-check, not a star rating). One note per user per place. As UGC it is
// reportable/removable (see moderation.ts).
export const vibeNotes = pgTable(
  'vibe_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    // Soft-removal for moderation (App Store 1.2 — "remove content"). A removed
    // note is retained for audit but filtered out of every read.
    removedAt: timestamp('removed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('vibe_notes_user_restaurant_uq').on(t.userId, t.restaurantId),
    index('vibe_notes_restaurant_idx').on(t.restaurantId),
  ],
)
