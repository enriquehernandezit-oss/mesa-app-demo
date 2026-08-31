import { bigint, boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { neighborhoods } from './reference'

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
  neighborhoodId: uuid('neighborhood_id').references(() => neighborhoods.id, {
    onDelete: 'set null',
  }),
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
