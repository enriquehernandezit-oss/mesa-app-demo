import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { neighborhoods } from './reference'

// Restaurants are the things people rank. Not user-owned, so no cascade from
// user. lat/lng feed the MapBox pins; coverImageId is a Cloudinary public id.
export const restaurants = pgTable(
  'restaurants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    neighborhoodId: uuid('neighborhood_id')
      .notNull()
      .references(() => neighborhoods.id, { onDelete: 'restrict' }),
    cuisine: text('cuisine'),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    coverImageId: text('cover_image_id'), // Cloudinary public id
    // E.164 phone for the reserve handoff (WhatsApp deep link / call). Reserve
    // is a handoff, not a booking engine — DR restaurants have no supply behind
    // it yet (BUILD_PLAN M5 / Phase 3).
    phone: text('phone'),
    // 1–4 ($ – $$$$), shown in meta lines and usable as a filter.
    priceTier: integer('price_tier'),
    // Marks seed/demo rows so they are never confused with real listings later.
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('restaurants_neighborhood_idx').on(t.neighborhoodId)],
)

// Want-to-try list. Composite PK: a place is saved at most once per user.
export const savedPlaces = pgTable(
  'saved_places',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.restaurantId] }),
    index('saved_places_restaurant_idx').on(t.restaurantId),
  ],
)
