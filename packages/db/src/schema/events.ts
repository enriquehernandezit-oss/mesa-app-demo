import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

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
