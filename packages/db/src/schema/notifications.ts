import { boolean, index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

import { user } from './auth'

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

// Per-user category switches, shown as 4 toggles on app/notificaciones.tsx.
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
