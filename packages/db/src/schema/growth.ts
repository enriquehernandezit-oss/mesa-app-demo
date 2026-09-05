import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { user } from './auth'

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
