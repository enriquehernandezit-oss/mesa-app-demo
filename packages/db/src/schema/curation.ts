import { index, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { restaurants } from './discovery'

// Editorial curated lists — "Top 10 Parrillas", "Mesa Best · DR 2026". NOT
// user-created in Phase 6; seeded by the team. A list is an ordered set of
// restaurants; membership drives the Discover carousel (with your own progress
// through it) and the list-membership pills on a restaurant profile.
export const lists = pgTable('lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  coverImageId: text('cover_image_id'),
  // Display order in the carousel (ascending).
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// A restaurant's ordered membership in a list. Composite PK: a place appears at
// most once per list.
export const listItems = pgTable(
  'list_items',
  {
    listId: uuid('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.listId, t.restaurantId] }),
    index('list_items_list_idx').on(t.listId),
    index('list_items_restaurant_idx').on(t.restaurantId),
  ],
)
