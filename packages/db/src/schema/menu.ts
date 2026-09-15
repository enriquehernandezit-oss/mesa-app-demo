import { date, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { restaurants } from './discovery'

// A restaurant's own published menu (M5) — verified prices/items sourced from
// the business itself, distinct from `dishes` (content.ts), which is a
// member's own photo attributed to their ranking. This table is display-only
// catalog data with no social attribution at all.
//
// Owned entirely by the Top 100 importer (packages/api/src/import-top100.ts):
// every import run deletes and re-inserts a restaurant's rows, so `position`
// (the sheet's own order; section order is each section's first appearance)
// is always a clean re-derivation, never a hand-patched sequence.
export const menuItems = pgTable(
  'menu_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    section: text('section').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    // Cents, not a float — source prices carry decimals (delivery-app prices
    // like 460.2 DOP), and cents survive that exactly where a float column
    // wouldn't reliably round-trip.
    priceCents: integer('price_cents'),
    currency: text('currency'), // 'DOP' | 'USD'
    // Free text or a URL depending on the source row — never rendered as a
    // link either way.
    sourceRef: text('source_ref'),
    verifiedAt: date('verified_at'),
    position: integer('position').notNull(),
  },
  (t) => [index('menu_items_restaurant_idx').on(t.restaurantId, t.position)],
)
