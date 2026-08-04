import { sql } from 'drizzle-orm'
import { check, index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './auth'

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
