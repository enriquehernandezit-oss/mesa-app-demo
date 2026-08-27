import { type SQL, sql } from 'drizzle-orm'
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { geoPrecision, restaurantSource } from './enums'
import { neighborhoods } from './reference'

// Restaurants are the things people rank. Not user-owned, so no cascade from
// user. lat/lng feed the MapBox pins; coverImageId is a Cloudinary public id.
export const restaurants = pgTable(
  'restaurants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    // Normalized (lowercased, accent-stripped) name for search — a generated
    // column so it's always in sync with `name` and can back a trigram index
    // directly (mesa_norm is defined in migration 0008, ahead of this column).
    nameKey: text('name_key').generatedAlwaysAs(
      (): SQL => sql`mesa_norm(${sql.identifier('name')})`,
    ),
    neighborhoodId: uuid('neighborhood_id')
      .notNull()
      .references(() => neighborhoods.id, { onDelete: 'restrict' }),
    cuisine: text('cuisine'),
    // Normalized cuisine for search, same idea as name_key — a generated
    // column rather than an expression index. Tried an expression index
    // directly (`gin (mesa_norm(cuisine) gin_trgm_ops)`) first: it fails with
    // "text search dictionary unaccent does not exist" when built in the same
    // transaction as the migration's CREATE EXTENSION, on a table that
    // already has rows — a real Postgres quirk where index-build expression
    // evaluation doesn't see the extension's dictionary yet, even though
    // GENERATED column population (this) does. Generated + plain-column index
    // sidesteps it entirely.
    cuisineKey: text('cuisine_key').generatedAlwaysAs(
      (): SQL => sql`mesa_norm(${sql.identifier('cuisine')})`,
    ),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    // 'exact' = a real geocode. 'sector' = sitting on the neighborhood's
    // centroid because no geocode exists yet (the map handler jitters these so
    // they don't stack) — see enums.ts.
    geoPrecision: geoPrecision('geo_precision').notNull().default('exact'),
    coverImageId: text('cover_image_id'), // Cloudinary public id
    // E.164 phone for the reserve handoff (WhatsApp deep link / call). Reserve
    // is a handoff, not a booking engine — DR restaurants have no supply behind
    // it yet (BUILD_PLAN M5 / Phase 3).
    phone: text('phone'),
    // Homepage for the "Website" utility pill (Phase 6 profile). Nullable — the
    // pill only renders when present.
    website: text('website'),
    // Closing-time display label, e.g. "1a", "11p", "12a". Feeds the "till 1a"
    // fragment in characteristics + the "Open now" filter. Display-only string,
    // not a parsed time — the demo has no real hours supply.
    closesAt: text('closes_at'),
    // 1–4 ($ – $$$$), shown in meta lines and usable as a filter.
    priceTier: integer('price_tier'),
    // Marks seed/demo rows so they are never confused with real listings later.
    isDemo: boolean('is_demo').notNull().default(false),
    // Where this row came from — see enums.ts. Drives ownership/edit rules
    // more precisely than isDemo does (which only distinguishes seed vs not).
    source: restaurantSource('source').notNull().default('seed'),
    // Free text, not structured — neither Foursquare nor a member ever supply
    // a validated street address, so this is display-only, never geocoded.
    address: text('address'),
    // Foursquare's locality field (roughly "Santo Domingo" vs a sub-area) —
    // separate from `neighborhoodId`, which is Mesa's own curated sector list.
    locality: text('locality'),
    // Foursquare OS Places' stable id, once imported (see M6). Lets the
    // importer re-run against the same row instead of duplicating it.
    fsqPlaceId: text('fsq_place_id'),
    // Google Places id, captured ONLY when a member picks a typeahead
    // suggestion (M8) — and that's the only Google-derived value ever stored;
    // per Google's Places policy, place_id is storable indefinitely but
    // coordinates/name/photos are not, so nothing else from Google lands here.
    googlePlaceId: text('google_place_id'),
    // When this row was last refreshed from whichever external source
    // populated it — a Foursquare extract (M6), or a Google Place Details
    // call (M9, when googlePlaceId is set). Null means nothing external has
    // ever refreshed it (seed data, or a plain member add). Lets a
    // reconciliation pass — or M9's 30-day Google refresh — find stale rows
    // without re-deriving "how old is this" from createdAt (which never
    // changes).
    sourceRefreshedAt: timestamp('source_refreshed_at'),
    // Who added a member-sourced row (App Store 1.2 traceability). Null for
    // seed/foursquare rows. Not cascaded — the restaurant (and any rankings
    // pointing at it) must outlive the member who added it.
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    // Business closed for good — distinct from a moderation removal below.
    // Never deleted (M6): a closed place may still be legitimately ranked.
    closedAt: timestamp('closed_at'),
    // Moderation removal (App Store 1.2) — a bad/duplicate/abusive listing.
    // Distinct from closedAt: this is Mesa acting on the row, not a fact
    // about the business itself.
    removedAt: timestamp('removed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('restaurants_neighborhood_idx').on(t.neighborhoodId),
    uniqueIndex('restaurants_fsq_place_id_uq')
      .on(t.fsqPlaceId)
      .where(sql`${t.fsqPlaceId} is not null`),
    uniqueIndex('restaurants_google_place_id_uq')
      .on(t.googlePlaceId)
      .where(sql`${t.googlePlaceId} is not null`),
    // Backs the search rewrite's mesa_norm(...) % / ILIKE matching at catalog
    // scale. name_key/cuisine_key are already normalized (the generated
    // columns above), so these index them directly rather than wrapping in
    // another expression.
    index('restaurants_name_key_trgm_idx').using('gin', sql`${t.nameKey} gin_trgm_ops`),
    index('restaurants_cuisine_key_trgm_idx').using('gin', sql`${t.cuisineKey} gin_trgm_ops`),
  ],
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
