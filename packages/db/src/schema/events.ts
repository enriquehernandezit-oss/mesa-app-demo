import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { restaurants } from './discovery'
import { eventRsvpStatus } from './enums'

// Mesa-curated events (M21) — never member-created. Kept current via
// apps/api/data/events.json + `bun run import:events` (see docs/EVENTS.md);
// the importer upserts by `slug` and NEVER deletes a row — an RSVP or a
// planes-prefill link could point at one, so an event that's off the
// calendar gets `cancelledAt` set instead (same soft-removal shape as
// dishes/vibeNotes). `startsAt`/`endsAt` are the schema's other deliberately
// timezone-aware timestamps — see plans.ts's own header for why a shared
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
    coverImageId: text('cover_image_id'), // Cloudinary public id; falls back to the restaurant's own cover when null
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
// insert. See eventRsvpStatus in enums.ts for why there's no third status.
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
