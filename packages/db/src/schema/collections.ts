import { sql } from 'drizzle-orm'
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { dishes } from './content'
import { restaurants } from './discovery'

// Saving (M19). `saved_places` (discovery.ts) stays the master "want to try"
// list unchanged; this file adds its dish counterpart plus user-created named
// lists layered on top of both masters. A save always touches its master
// list; a named list is an ADDITIONAL place that same save also appears —
// see routes/saved.ts and routes/collections.ts for the actual rules
// (unsaving removes an item everywhere, ranking a place only clears it from
// the master list, never from a named list it's in).

// The dish equivalent of saved_places.
export const savedDishes = pgTable(
  'saved_dishes',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    dishId: uuid('dish_id')
      .notNull()
      .references(() => dishes.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.dishId] }),
    index('saved_dishes_dish_idx').on(t.dishId),
  ],
)

// A member's own named list ("Para el cumpleaños de mamá"). Name unique per
// user so `guardar.tsx`'s "Nueva lista" can't silently create a duplicate.
export const collections = pgTable(
  'collections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('collections_user_name_uq').on(t.userId, t.name),
    index('collections_user_idx').on(t.userId),
  ],
)

// One row = one restaurant OR one dish in one list — never both, enforced by
// the CHECK below. The two unique constraints keep a list from holding the
// same restaurant (or dish) twice; Postgres treats each NULL as distinct, so
// a dish row's null restaurantId never collides with another dish row's null
// restaurantId under the restaurant-scoped constraint, and vice versa.
export const collectionItems = pgTable(
  'collection_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }),
    dishId: uuid('dish_id').references(() => dishes.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    check(
      'collection_items_exactly_one',
      sql`(${t.restaurantId} is not null)::int + (${t.dishId} is not null)::int = 1`,
    ),
    index('collection_items_collection_idx').on(t.collectionId),
    unique('collection_items_collection_restaurant_uq').on(t.collectionId, t.restaurantId),
    unique('collection_items_collection_dish_uq').on(t.collectionId, t.dishId),
  ],
)
