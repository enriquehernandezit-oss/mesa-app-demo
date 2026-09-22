import { index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

import { user } from './auth'
import { restaurants } from './discovery'

// Dish ranking + the repeat-dish nudge (M20). A dish_lists row is created
// automatically — never by a direct create call — the moment a member's
// distinct-restaurant count for one nameKey (routes/dishes.ts's POST
// handler) reaches 3; see that file's own comment for the exact trigger.
// `label` is a snapshot of how the member themselves spells the dish
// ("Carbonara"), computed once at creation from their own dish rows — it
// never needs to track spelling drift afterward, unlike the shared
// restaurant/dish name_key indexes, because this list is scoped to one
// person's own dishes, not cross-member aggregation.
export const dishLists = pgTable(
  'dish_lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    nameKey: text('name_key').notNull(),
    label: text('label').notNull(),
    // Set once the member completes the pairwise flow (PUT .../order) — null
    // until then, which is also what makes a list "due" for the M17 sweep's
    // ~20h-later nudge (see routes/dishLists.ts and lib/push.ts).
    rankedAt: timestamp('ranked_at'),
    // A member can dismiss the inline nudge card / the push without ranking
    // — dismissedAt stops both, but never blocks a later manual visit from
    // Profile's "Tus platos".
    dismissedAt: timestamp('dismissed_at'),
    // Set the one time the sweep actually sends the "~20h later" push, so a
    // list is only ever nudged once regardless of how many sweep ticks pass.
    pushedAt: timestamp('pushed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('dish_lists_user_name_key_uq').on(t.userId, t.nameKey),
    // The sweep's own due-list query filters on exactly these three columns.
    index('dish_lists_due_idx').on(t.rankedAt, t.dismissedAt, t.pushedAt),
  ],
)

// One row per restaurant placed in the pairwise order — restaurantId, not
// dishId, per the plan: a member's dishes table already guarantees at most
// one (not-removed) dish row per (userId, restaurantId, nameKey) — the same
// upsert-on-(rankingId, nameKey) rule routes/dishes.ts's POST handler
// enforces — so restaurantId alone is enough to find the matching dish row
// back (userId + nameKey are fixed by the parent list) whenever the actual
// dish name/photo/caption needs to be rendered.
export const dishListItems = pgTable(
  'dish_list_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listId: uuid('list_id')
      .notNull()
      .references(() => dishLists.id, { onDelete: 'cascade' }),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('dish_list_items_list_restaurant_uq').on(t.listId, t.restaurantId),
    index('dish_list_items_list_idx').on(t.listId, t.position),
  ],
)
