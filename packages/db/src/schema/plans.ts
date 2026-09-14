import { index, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { restaurants } from './discovery'
import { planReply, planStatus } from './enums'

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
