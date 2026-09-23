import { relations, sql, type SQL } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// Schema v1 — the spine. Every Mesa table, enum, and relation in one file so
// the whole database's shape reads top to bottom without hopping between
// files. Declaration order follows dependency: a table only appears after
// everything it references (an enum, another table) — except `relations()`
// calls, which are eager (they read a table object directly, not lazily) and
// so must all come after every table they touch. Every OTHER cross-table
// reference (`.references(() => other.id)`) is itself a lazy arrow function,
// so those never depend on declaration order — they're just kept close to
// what naturally groups with them.

// ── Enums ────────────────────────────────────────────────────────────────

// What a report can point at. Vibe notes, dish posts and ranking comments are
// the UGC; users can also be reported directly (App Store 1.2).
export const reportTargetType = pgEnum('report_target_type', [
  'vibe_note',
  'user',
  'dish',
  'comment',
])

// Moderation lifecycle for a report.
export const reportStatus = pgEnum('report_status', ['open', 'reviewing', 'actioned', 'dismissed'])

// Where a restaurant row came from. 'seed' = demo data, 'foursquare' = the OS
// Places bulk import, 'member' = added through the app (either by hand or via
// the Google Places typeahead gap-filler), 'catalog' = a curated real-world
// import (M5's Top 100 + menus) — real, non-demo data, but distinct from
// 'foursquare' since it isn't a bulk geo extract and carries its own
// menu_items rows the seed guard must also protect.
export const restaurantSource = pgEnum('restaurant_source', [
  'seed',
  'foursquare',
  'member',
  'catalog',
])

// How trustworthy a restaurant's lat/lng actually is. 'exact' = a real geocode
// (seeded, or Foursquare-sourced). 'sector' = no geocode exists yet, so it sits
// on its neighborhood's centroid rather than a fabricated street address; the
// map handler (GET /restaurants/map) fans these out with a deterministic
// per-id jitter so they don't stack on one pixel.
export const geoPrecision = pgEnum('geo_precision', ['exact', 'sector'])

// A group dinner's lifecycle. 'open' = still voting (2–3 candidate spots) or
// just awaiting its date; 'confirmed' = the host picked a spot, whether that
// took a vote or the plan only ever had one spot to begin with; 'cancelled' =
// the host called it off. Terminal states don't revert to 'open'.
export const planStatus = pgEnum('plan_status', ['open', 'confirmed', 'cancelled'])

// A guest's RSVP on a plan. 'pending' is the default until they answer; the
// other three are their actual reply. There is no 'maybe I'll vote later' —
// voting for a spot (see the plan tables below) is independent of this.
export const planReply = pgEnum('plan_reply', ['pending', 'going', 'maybe', 'declined'])

// Who's credited for a curated list (M15). 'mesa' (the default) is the
// editorial team itself — every list before this milestone, and most after
// it. 'creator'/'venue' are for a byline that isn't Mesa's own; the four
// seeded lists' mock creators are fictional (never a real influencer's name)
// per the founder's own instruction.
export const listAuthorKind = pgEnum('list_author_kind', ['mesa', 'creator', 'venue'])

// A member's RSVP on a Mesa-curated event (M21). Only two states, not plans'
// four-way reply — an event has no host to notify of a decline, so "not
// interested" is just the absence of a row (DELETE /events/:id/rsvp), same
// bookmark-on/off shape as saved_places rather than plans' pending/declined.
export const eventRsvpStatus = pgEnum('event_rsvp_status', ['going', 'interested'])

// ── Reference data ───────────────────────────────────────────────────────

// The target zones (reference/enum-like). A table, not a pgEnum, because
// restaurants and users FK to it and we want a display name alongside the slug.
// Seeded with the five neighborhoods from CLAUDE.md. Declared early since
// `user` and `restaurants` both reference it.
export const neighborhoods = pgTable('neighborhoods', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(), // piantini, naco, bella-vista, serralles, zona-colonial
  name: text('name').notNull(),
  // A centroid for the sector, not a single street address — computed from the
  // seeded restaurants' own coordinates (see migration 0008's backfill), not
  // guessed. Used for (a) the RankAPlace "Cerca" fallback sort before a
  // geocode exists, (b) placing a member-added restaurant on SOMETHING better
  // than the city center, jittered by radiusM so they don't all stack on one
  // pixel (see MapScreen's project()).
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  radiusM: integer('radius_m').notNull(),
})

// ── Auth (Better Auth) ───────────────────────────────────────────────────

// Identity is owned by Better Auth. These four tables match Better Auth's
// default Drizzle schema; `user` is EXTENDED with Mesa's profile fields so there
// is exactly one identity per person — no parallel "users" table to keep in
// sync. One user can carry Apple, Instagram, and phone identities via `account`.
//
// Everything a user owns cascades from user.id ON DELETE — that is what makes
// in-app account deletion (App Store 5.1.1) actually erase their data.

export const user = pgTable('user', {
  // Better Auth core
  id: text('id').primaryKey(),
  // Defaults to '' so a phone-first signup (no display name yet) can't fail the
  // insert; the real name is captured during onboarding.
  name: text('name').notNull().default(''),
  email: text('email').unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  // Phone-number plugin
  phoneNumber: text('phone_number').unique(),
  phoneNumberVerified: boolean('phone_number_verified').notNull().default(false),

  // --- Mesa profile fields ---
  handle: text('handle').unique(), // @handle; set during onboarding
  bio: text('bio'),
  // A real Instagram @, separate from `handle` above (M23) — `handle` is
  // Mesa's own unique username (it's what /p/u/:handle and the leaderboard's
  // eligibility filter key off), which the UI used to just label "Instagram"
  // for lack of a dedicated field. Display-only, like `handle` — no OAuth
  // verification, and unlike `handle` it isn't unique (two members can list
  // the same public account without conflict).
  instagramHandle: text('instagram_handle'),
  website: text('website'),
  // A member's own picks, free text against the same cuisine vocabulary
  // `restaurants.cuisine` already uses (cuisineLabel() in lib/display.ts) —
  // no separate cuisines table exists to foreign-key against, matching how
  // restaurant.cuisine itself is stored. Feeds the taste-match/friend-
  // suggestion scoring (M23's own milestone) once a member sets it.
  favoriteCuisines: text('favorite_cuisines').array(),
  // Private (M23): collected as a mandatory signup step so the founder has
  // real age-range data, but never shown on the public profile or to
  // followers — account settings only. Nullable at the column level anyway
  // (existing members predate this field and can't be retroactively forced
  // to backfill one), even though onboarding requires it for anyone new.
  birthday: date('birthday'),
  neighborhoodId: uuid('neighborhood_id').references(() => neighborhoods.id, {
    onDelete: 'set null',
  }),
  // Opt-in contacts find-friends (M18) — HMAC(PHONE_MATCH_SECRET, E.164) of a
  // number the member deliberately submitted via PUT /me/phone, NOT
  // `phoneNumber` above (that one's Better Auth's own sign-in identity, and
  // matching would leak who has phone sign-in enabled). Never the plaintext
  // number — see packages/db/src/phone.ts's own header. Unique so a hash
  // collision can't silently point two accounts at the same contact match.
  phoneHash: text('phone_hash').unique(),
  // EULA acceptance is required at signup for a UGC app (App Store 1.2).
  eulaAcceptedAt: timestamp('eula_accepted_at'),

  // --- Moderation (App Store 1.2) ---
  // Ejected users: set on moderation action; the session middleware rejects any
  // request from a banned account, and their content is filtered from reads.
  bannedAt: timestamp('banned_at'),
  // Who may take moderation actions (remove content / eject users). No admin UI
  // in Phase 1 — flipped directly in the DB — but the capability must exist.
  isModerator: boolean('is_moderator').notNull().default(false),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// A member's "go-to" neighborhoods (M23) — plural, unlike user.neighborhoodId
// above (their one home sector from onboarding). A join table, not a uuid[]
// column, matching how every other many-to-many in this schema is modeled
// (follows, cheers, saved_dishes, dish_cheers…) rather than introducing a
// second pattern; a real FK also means a deleted neighborhood can't leave a
// dangling reference the way an array element would.
export const userFavoriteNeighborhoods = pgTable(
  'user_favorite_neighborhoods',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    neighborhoodId: uuid('neighborhood_id')
      .notNull()
      .references(() => neighborhoods.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.neighborhoodId] })],
)

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(), // provider's user id
  providerId: text('provider_id').notNull(), // 'apple' | 'instagram' | 'phone' | 'credential'
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// Better Auth's rate-limit counters. Persisted rather than kept in process
// memory (the library's default) for two reasons: the API redeploys on every
// push, and an in-memory limiter forgets every counter each time — so an
// attacker just waits for a deploy, and the window never really holds. The
// library prunes expired rows itself in the background, so this needs no
// retention job.
//
// lastRequest is milliseconds since the epoch, stored as bigint but read as a
// JS number: the library does arithmetic (`now - lastRequest`) on it directly.
// 1.6.25 coerces a bigint back to Number when reading, but modelling it as a
// number here means the limiter never depends on that coercion staying.
export const rateLimit = pgTable('rate_limit', {
  // The drizzle adapter requires an `id` on every Better Auth model and throws
  // when it's missing — at REQUEST time, not boot, so the symptom is every
  // auth call 500ing on a deployed build. `key` is the column actually looked
  // up, so it carries the unique index.
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
})

// Per-account sign-in throttling (credential stuffing defence).
//
// Deliberately NOT stored in rate_limit: Better Auth prunes that table of
// everything older than 60s whenever any window rolls over, which would erase
// an escalating backoff almost immediately.
//
// Keyed on the submitted identifier, existing account or not — that symmetry is
// what makes it safe to answer with an honest "too many attempts": a probe
// learns nothing from the lock, because an unknown address locks exactly like a
// real one. lockedUntil is derived from failures + lastFailureAt rather than
// stored, so there is only one source of truth to keep consistent.
export const authThrottle = pgTable('auth_throttle', {
  key: text('key').primaryKey(),
  failures: integer('failures').notNull(),
  lastFailureAt: timestamp('last_failure_at').notNull(),
})

// A minimal auth audit trail.
//
// It earns a table on one argument: when a member says "someone got into my
// account", there is currently NOTHING to answer with — no sign-in history, no
// addresses, no record of a password change. Railway's logs are neither
// retained long enough nor queryable per user, and for a social app carrying
// real identities in one small city, that question will eventually be asked.
//
// Deliberately narrow. No PII beyond what the session table already stores, and
// never a password, token, or OTP code. userId is nullable so a failed sign-in
// for an address that does not exist can still be recorded — which is exactly
// the row you want when reconstructing an attack.
export const authEvent = pgTable('auth_event', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  // sign_in | sign_in_failed | sign_up | password_reset | password_changed |
  // sessions_revoked
  type: text('type').notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ── Discovery: restaurants ───────────────────────────────────────────────

// Restaurants are the things people rank. Not user-owned, so no cascade from
// user. lat/lng feed the MapBox pins; coverImageId is a full R2 URL (or a
// root-relative seed path for the catalog art this API serves itself).
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
    // they don't stack) — see the enum above.
    geoPrecision: geoPrecision('geo_precision').notNull().default('exact'),
    coverImageId: text('cover_image_id'), // a full R2 URL, or a seed path
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
    // Where this row came from — see the enum above. Drives ownership/edit
    // rules more precisely than isDemo does (which only distinguishes seed vs
    // not).
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

// ── Saving: dishes and named collections ─────────────────────────────────

// Saving (M19). `saved_places` (above) stays the master "want to try" list
// unchanged; this section adds its dish counterpart plus user-created named
// lists layered on top of both masters. A save always touches its master
// list; a named list is an ADDITIONAL place that same save also appears —
// see routes/saved.ts and routes/collections.ts for the actual rules
// (unsaving removes an item everywhere, ranking a place only clears it from
// the master list, never from a named list it's in).

// The dish equivalent of saved_places. `dishes` itself is declared further
// below (Content), but the reference here is a lazy arrow, so declaration
// order doesn't matter.
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
// description + coverImageId are the optional playlist-style header; with no
// cover the list endpoint falls back to its newest item's photo.
export const collections = pgTable(
  'collections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    coverImageId: text('cover_image_id'), // same value shapes as dishes.imageId
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

// ── Menu ─────────────────────────────────────────────────────────────────

// A restaurant's own published menu (M5) — verified prices/items sourced from
// the business itself, distinct from `dishes` (below), which is a member's
// own photo attributed to their ranking. This table is display-only catalog
// data with no social attribution at all.
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

// ── Curation: editorial lists ────────────────────────────────────────────

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
  // Longer editorial copy for the list's own detail page (subtitle stays the
  // short carousel-card line) — nullable, since not every list earns one.
  description: text('description'),
  // "Cómo la armamos" — the criteria behind the list, shown collapsed on the
  // detail page. Distinct from `description` (what the list IS) vs this
  // (how it was PUT TOGETHER).
  curationNote: text('curation_note'),
  authorKind: listAuthorKind('author_kind').notNull().default('mesa'),
  // Null for authorKind: 'mesa' — the byline falls back to "Mesa" without
  // needing these filled in for the common case.
  authorName: text('author_name'),
  authorHandle: text('author_handle'),
  authorAvatarId: text('author_avatar_id'),
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

// ── Ranking: the core loop ───────────────────────────────────────────────

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

// A comment on a friend's ranking (a feed post — a dish post is a ranking too,
// so this covers both). Many per user per ranking, so it has its own id rather
// than cheers' composite key. UGC: reportable, and soft-removed by moderation
// like vibe notes (the author or the ranking's owner hard-deletes instead).
export const rankingComments = pgTable(
  'ranking_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rankingId: uuid('ranking_id')
      .notNull()
      .references(() => rankings.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    removedAt: timestamp('removed_at'),
  },
  // A thread reads oldest-first within one ranking; the feed's latest-comment
  // lookup walks the same index backwards.
  (t) => [index('ranking_comments_ranking_created_idx').on(t.rankingId, t.createdAt)],
)

// The "why" — one short line attached to a ranking. This is Mesa's identity
// (vibe-check, not a star rating). One note per user per place. As UGC it is
// reportable/removable (see moderation, below).
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

// ── Content: dishes ──────────────────────────────────────────────────────

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
// imageId holds a full R2 URL from a signed upload (see apps/api/src/lib/r2.ts)
// — nullable as of M11: a dish with a name and category but no photo is a
// first-class row, not a broken one (this is also what a `rankings.favoriteDish`
// string becomes once it's backfilled into the dishes table). removedAt is
// soft-removal, mirroring vibe notes (App Store 1.2 — UGC must be removable).
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
    // Normalized for search — see restaurants.nameKey above for why this is a
    // generated column rather than an expression index.
    nameKey: text('name_key').generatedAlwaysAs(
      (): SQL => sql`mesa_norm(${sql.identifier('name')})`,
    ),
    caption: text('caption'),
    imageId: text('image_id'),
    // Nullable until the M11 backfill is confirmed against production and a
    // follow-up migration tightens this to NOT NULL (see dishCategories above).
    categoryId: text('category_id').references(() => dishCategories.id),
    // The one-tap sentiment captured alongside the dish in the rank flow —
    // raw material for the next milestone's dish ranking, not surfaced in any
    // UI yet beyond the tap itself. loved | fine | disliked.
    sentiment: text('sentiment'),
    // Capture-time grain treatment (a delivery-time transform, once one exists).
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

// A "cheers" on a dish (M22) — `cheers` above can't be reused for this: it has
// a hard FK straight to `rankings`, and one ranking can carry up to 3 dishes
// (this table's own upsert key), so cheering the ranking would be strictly
// coarser than cheering one dish on it and the counts would be
// indistinguishable. Same shape as saved_dishes: one row per (user, dish),
// deleting either side cascades.
export const dishCheers = pgTable(
  'dish_cheers',
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
    index('dish_cheers_dish_idx').on(t.dishId),
  ],
)

// ── Dish lists: the repeat-dish nudge ────────────────────────────────────

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

// ── Events ───────────────────────────────────────────────────────────────

// Mesa-curated events (M21) — never member-created. Kept current via
// apps/api/data/events.json + `bun run import:events` (see docs/EVENTS.md);
// the importer upserts by `slug` and NEVER deletes a row — an RSVP or a
// planes-prefill link could point at one, so an event that's off the
// calendar gets `cancelledAt` set instead (same soft-removal shape as
// dishes/vibeNotes). `startsAt`/`endsAt` are the schema's other deliberately
// timezone-aware timestamps — see the plans table below for why a shared
// future instant every member's client renders can't depend on the writing
// process's own TZ.
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    // Free text, Mesa's own editorial label ("Música en vivo", "Happy hour",
    // "Brunch") — not a closed taxonomy, same call as restaurants.cuisine.
    category: text('category'),
    priceLabel: text('price_label'), // "Cover RD$500" / "Gratis" / null = unlisted
    // An external link — a real-world ticket never needs Apple in-app
    // purchase, so this is a plain outbound URL, not a purchase flow.
    ticketUrl: text('ticket_url'),
    coverImageId: text('cover_image_id'), // a full R2 URL; falls back to the restaurant's own cover when null
    // Total spots; null = open/unlimited. The API derives spotsLeft from it
    // and the live going-count — never stored, so it can't drift.
    capacity: integer('capacity'),
    // Booking by WhatsApp — digits only, E.164 without the '+'
    // ("18095551234"), the exact form a wa.me link takes. null = no booking.
    bookingWhatsapp: text('booking_whatsapp'),
    // Has the venue actually agreed to this event? The importer's mock/seed
    // events sit on real Santo Domingo restaurants that never confirmed them,
    // so the honest default is false — a member sees "evento de muestra" on
    // every card until someone flips this. Never defaults to true: a
    // forgotten flag must fail toward disclosure, not toward looking real.
    venueConfirmed: boolean('venue_confirmed').notNull().default(false),
    cancelledAt: timestamp('cancelled_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('events_restaurant_idx').on(t.restaurantId),
    // The browse queries (tonight/weekend/upcoming) all filter on
    // (not cancelled, starts_at range) and order by starts_at — index the
    // exact column they need.
    index('events_starts_at_idx').on(t.startsAt),
  ],
)

// One member's RSVP — 'going' or 'interested'. Switching status is a plain
// overwrite (there's no history, only the current answer, same as a plan's
// reply); going through a real UNIQUE-per-row model via the composite PK
// means an upsert is exactly one onConflictDoUpdate, never a delete-then-
// insert. See eventRsvpStatus above for why there's no third status.
export const eventRsvps = pgTable(
  'event_rsvps',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: eventRsvpStatus('status').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.userId] }),
    index('event_rsvps_user_idx').on(t.userId),
  ],
)

// A member's saved event — the Save bookmark, INDEPENDENT of the RSVP above
// (a member can be going AND have it saved). Row present = saved, same shape
// as saved_dishes. Events only ever go to the general Saved area, never to a
// custom collection, so there's no collection column and no collection_items
// hook — PUT/DELETE /events/:id/save is the whole surface.
export const savedEvents = pgTable(
  'saved_events',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.userId] }),
    index('saved_events_user_idx').on(t.userId),
  ],
)

// ── Social graph ─────────────────────────────────────────────────────────

// The social graph. follower_id follows following_id. Composite PK prevents
// duplicate follows; the CHECK stops a user following themselves. Both sides
// index so "who I follow" and "who follows me" are each a single scan.
export const follows = pgTable(
  'follows',
  {
    followerId: text('follower_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    followingId: text('following_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followingId] }),
    index('follows_following_idx').on(t.followingId),
    check('follows_no_self', sql`${t.followerId} <> ${t.followingId}`),
  ],
)

// Required for a UGC app (App Store 1.2). A block hides content in both
// directions; the feed query filters on this table so a blocked user's rankings
// and notes never appear.
export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerId: text('blocker_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    blockedId: text('blocked_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    index('user_blocks_blocked_idx').on(t.blockedId),
    check('user_blocks_no_self', sql`${t.blockerId} <> ${t.blockedId}`),
  ],
)

// ── Growth: invites ──────────────────────────────────────────────────────

// Invites. Deliberately NOT scarce: one permanent, reusable code per member,
// unlimited redemptions, and nothing in Mesa is ever gated behind having been
// invited. Beli's loudest complaint is its invite-4-friends wall ("MLM vibes"),
// and Clubhouse proved scarcity-as-identity collapses the moment the novelty
// does. This exists to MEASURE the loop (k-factor) and to personalize the
// landing page — not to ration access.
export const invites = pgTable(
  'invites',
  {
    // Short, URL-safe, human-readable in a WhatsApp message. Generated in the
    // API (lib/inviteCode.ts) from an unambiguous alphabet — no 0/O/1/I.
    code: text('code').primaryKey(),
    // One code per member, created lazily the first time they open the share
    // sheet. The unique index is what enforces "one".
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('invites_user_idx').on(t.userId)],
)

// Who joined because of whom. A separate table rather than a column on `user`
// so attribution stays append-only and auditable, and so a deleted inviter
// doesn't quietly rewrite history (the FK cascades, which is the intent — the
// edge is meaningless without both people).
//
// invitedUserId is UNIQUE: a member is attributed to at most one inviter, ever,
// and the first attribution wins. That is what makes k-factor countable.
export const inviteRedemptions = pgTable(
  'invite_redemptions',
  {
    code: text('code')
      .notNull()
      .references(() => invites.code, { onDelete: 'cascade' }),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    invitedUserId: text('invited_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('invite_redemptions_user_idx').on(t.invitedUserId),
    index('invite_redemptions_inviter_idx').on(t.inviterId),
    // Inviting yourself would inflate k-factor with a single account.
    check('invite_no_self', sql`${t.inviterId} <> ${t.invitedUserId}`),
  ],
)

// ── Moderation ───────────────────────────────────────────────────────────

// UGC moderation (App Store 1.2). A report points at a vibe note or a user.
// targetId is kept as text so it can hold either a note uuid or a user id
// without two nullable FK columns. The reporter cascades on account deletion;
// the report itself is retained (status history) rather than FK-linked to the
// target, since the target may be removed as part of moderation.
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterId: text('reporter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    targetType: reportTargetType('target_type').notNull(),
    targetId: text('target_id').notNull(),
    reason: text('reason').notNull(),
    status: reportStatus('status').notNull().default('open'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('reports_status_idx').on(t.status),
    index('reports_target_idx').on(t.targetType, t.targetId),
  ],
)

// ── Notifications ────────────────────────────────────────────────────────

// Push notifications (M17). One row per device — a member signed in on two
// phones gets two rows, both pushed to. `token` (Expo's own push token
// string) is the PK: re-registering the same device just re-inserts the same
// row (onConflictDoNothing in the route), and a token that migrates to
// another account (device passed on, app reinstalled) naturally moves with
// it rather than duplicating.
export const pushTokens = pgTable(
  'push_tokens',
  {
    token: text('token').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('push_tokens_user_idx').on(t.userId)],
)

// Per-user category switches, shown as 4 toggles on app/notifications.tsx.
// All default true — a member who never opens the screen gets everything a
// signed-up-for push implies. No row yet (never touched the screen) means
// the same thing: lib/push.ts and GET /notifications/prefs both treat a
// missing row as all-true, so this table is only ever written when someone
// actually flips a switch.
export const notificationPrefs = pgTable('notification_prefs', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Follows + cheers — reactions to you.
  social: boolean('social').notNull().default(true),
  // Plan invites, replies, votes.
  plans: boolean('plans').notNull().default(true),
  // A friend ranked a place you saved.
  friends: boolean('friends').notNull().default(true),
  // Repeat-dish nudges (M20) — the pref exists now so this screen doesn't
  // need a second migration once that milestone lands.
  dishes: boolean('dishes').notNull().default(true),
  // An RSVP'd event's own reminders (24h/3h/2h/at-start) and its
  // cancellation push — split out from `friends` (M22), which is about a
  // friend's activity, not your own commitment. The "a friend RSVP'd going"
  // notification moved here too, since it's about the same event, not about
  // the friend as a person.
  events: boolean('events').notNull().default(true),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// One row per (userId, key) push actually sent — the dedupe/throttle gate
// every trigger claims before calling the Expo API (lib/push.ts's `claim`).
// `key` encodes enough of the event to make re-delivery impossible (a plain
// event id for a one-time push like a follow; an hour-bucketed key for
// cheers' "≤1 per ranking per hour" throttle). Pruned on a retention window
// in migrate.ts, same pattern as authEvent — this is a dedupe log, not an
// audit trail, so it only needs to outlive the longest throttle window.
export const pushLog = pgTable(
  'push_log',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    sentAt: timestamp('sent_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
)

// ── Plans: group dinners ─────────────────────────────────────────────────

// A group dinner a member arms and invites their followers to. `startsAt` is
// the one deliberately timezone-aware timestamp in the schema (every other
// table's plain `timestamp` is fine being naive, since it's only ever read
// back by the same process that wrote it) — a shared future instant that many
// people's clients render must not depend on the writing process's own TZ
// (dev Mac is UTC-4, Railway is UTC).
//
// `chosenRestaurantId` is set at creation when the host picked one fixed
// spot (status starts 'confirmed'), or later by POST /plans/:id/confirm once
// a vote across `planOptions` settles (status moves 'open' → 'confirmed').
export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: text('host_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    note: text('note'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    status: planStatus('status').notNull().default('open'),
    chosenRestaurantId: uuid('chosen_restaurant_id').references(() => restaurants.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('plans_host_idx').on(t.hostId)],
)

// The candidate spot(s) for a plan. One row = a fixed venue (the plan is
// created 'confirmed' and this is its only option); two or three rows = a
// vote, `position` holding the order they were proposed in. Guests vote by
// pointing `planInvites.voteRestaurantId` at one of these rows — there's no
// separate "votes" table, the count is just how many invites point here.
export const planOptions = pgTable(
  'plan_options',
  {
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.planId, t.restaurantId] }),
    index('plan_options_restaurant_idx').on(t.restaurantId),
  ],
)

// One row per invited follower. The host is NOT a row here — "host ≠
// invitee" is enforced in the API, not the schema, since a CHECK here can't
// see `plans.host_id` across tables. `voteRestaurantId` is null until the
// guest votes (only meaningful while the plan's `planOptions` has >1 row);
// `reply` and the vote are independent of each other by design — declining
// doesn't clear a vote already cast, and voting doesn't imply a reply.
export const planInvites = pgTable(
  'plan_invites',
  {
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    reply: planReply('reply').notNull().default('pending'),
    voteRestaurantId: uuid('vote_restaurant_id').references(() => restaurants.id, {
      onDelete: 'set null',
    }),
    repliedAt: timestamp('replied_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.planId, t.userId] }),
    index('plan_invites_user_idx').on(t.userId),
  ],
)

// ── Waitlist ─────────────────────────────────────────────────────────────

// Mirrors the pre-launch quiz's waitlist so quiz-takers are already known when
// they open the app (zero visual/identity seam — DESIGN.md). The quiz's exact
// columns aren't in this repo, so this is a minimal superset: a contact and the
// quiz result. Widen to match the real export when it lands.
export const waitlist = pgTable('waitlist', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email'),
  phone: text('phone'),
  instagramHandle: text('instagram_handle'),
  quizResult: text('quiz_result'), // e.g. the "¿Qué tipo de foodie eres?" outcome
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ── Relations ────────────────────────────────────────────────────────────
// Relations power Drizzle's relational queries, which fetch related rows in a
// single round trip — the primary tool for the "always prevent N+1" rule. Every
// feed/list read in the API uses these instead of looping queries.
//
// These come LAST and only here: unlike a `.references(() => other.id)` arrow,
// `relations(table, ...)` reads `table` immediately, so every table it touches
// must already be declared above.

export const userRelations = relations(user, ({ one, many }) => ({
  neighborhood: one(neighborhoods, {
    fields: [user.neighborhoodId],
    references: [neighborhoods.id],
  }),
  rankings: many(rankings),
  vibeNotes: many(vibeNotes),
  savedPlaces: many(savedPlaces),
  // The social graph, disambiguated by relationName because both sides FK user.
  following: many(follows, { relationName: 'follower' }),
  followers: many(follows, { relationName: 'following' }),
  blocking: many(userBlocks, { relationName: 'blocker' }),
  blockedBy: many(userBlocks, { relationName: 'blocked' }),
}))

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(user, {
    fields: [follows.followerId],
    references: [user.id],
    relationName: 'follower',
  }),
  following: one(user, {
    fields: [follows.followingId],
    references: [user.id],
    relationName: 'following',
  }),
}))

export const userBlocksRelations = relations(userBlocks, ({ one }) => ({
  blocker: one(user, {
    fields: [userBlocks.blockerId],
    references: [user.id],
    relationName: 'blocker',
  }),
  blocked: one(user, {
    fields: [userBlocks.blockedId],
    references: [user.id],
    relationName: 'blocked',
  }),
}))

export const neighborhoodsRelations = relations(neighborhoods, ({ many }) => ({
  restaurants: many(restaurants),
  users: many(user),
}))

export const restaurantsRelations = relations(restaurants, ({ one, many }) => ({
  neighborhood: one(neighborhoods, {
    fields: [restaurants.neighborhoodId],
    references: [neighborhoods.id],
  }),
  rankings: many(rankings),
  vibeNotes: many(vibeNotes),
  savedBy: many(savedPlaces),
  menuItems: many(menuItems),
}))

export const menuItemsRelations = relations(menuItems, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [menuItems.restaurantId],
    references: [restaurants.id],
  }),
}))

export const rankingsRelations = relations(rankings, ({ one }) => ({
  user: one(user, { fields: [rankings.userId], references: [user.id] }),
  restaurant: one(restaurants, {
    fields: [rankings.restaurantId],
    references: [restaurants.id],
  }),
}))

export const vibeNotesRelations = relations(vibeNotes, ({ one }) => ({
  user: one(user, { fields: [vibeNotes.userId], references: [user.id] }),
  restaurant: one(restaurants, {
    fields: [vibeNotes.restaurantId],
    references: [restaurants.id],
  }),
}))

export const savedPlacesRelations = relations(savedPlaces, ({ one }) => ({
  user: one(user, { fields: [savedPlaces.userId], references: [user.id] }),
  restaurant: one(restaurants, {
    fields: [savedPlaces.restaurantId],
    references: [restaurants.id],
  }),
}))

// Only these three tables' relations exist for plans — the API's own routes
// build their own joins for everything else (GET /plans, /plans/:id), same as
// dishes/cheers/moderation elsewhere in this schema. This set exists because
// the public share page (routes/share-pages.ts) reads via one relational
// query (`db.query.plans.findFirst({ with: { host, options: { with: { restaurant } } } })`)
// rather than hand-joining for a single, low-traffic public page.
export const plansRelations = relations(plans, ({ one, many }) => ({
  host: one(user, { fields: [plans.hostId], references: [user.id] }),
  chosenRestaurant: one(restaurants, {
    fields: [plans.chosenRestaurantId],
    references: [restaurants.id],
  }),
  options: many(planOptions),
  invites: many(planInvites),
}))

export const planOptionsRelations = relations(planOptions, ({ one }) => ({
  plan: one(plans, { fields: [planOptions.planId], references: [plans.id] }),
  restaurant: one(restaurants, {
    fields: [planOptions.restaurantId],
    references: [restaurants.id],
  }),
}))

export const planInvitesRelations = relations(planInvites, ({ one }) => ({
  plan: one(plans, { fields: [planInvites.planId], references: [plans.id] }),
  user: one(user, { fields: [planInvites.userId], references: [user.id] }),
  voteRestaurant: one(restaurants, {
    fields: [planInvites.voteRestaurantId],
    references: [restaurants.id],
  }),
}))
