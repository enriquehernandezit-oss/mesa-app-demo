import { db, schema } from '@mesa/db'
import { and, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

const { follows, userBlocks, rankingComments, rankings, user } = schema

// The follow/block subqueries that gate almost every social read — the feed,
// the activity bell, a restaurant's friend scores and dish rail, a user's
// passport. They were re-inlined ~10 times, each an identical little builder;
// one drifting copy is how a visibility rule (a security control) silently goes
// wrong. Defined once here, they compose straight into inArray/notInArray with
// no extra round trip. Each returns a fresh builder, so a statement can use
// more than one without alias collisions.
//
// notInArray against these is safe when empty: it becomes `NOT IN (SELECT …)`,
// which excludes nothing — unlike an empty JS array, which Drizzle would refuse.

// Ids the given user follows.
export const followingIds = (userId: string) =>
  db.select({ id: follows.followingId }).from(follows).where(eq(follows.followerId, userId))

// Ids that follow the given user. The mirror of followingIds — added
// alongside GET /social/followers, which needed it and had no existing helper
// (every prior reader of "who follows X" was a one-off inline join).
export const followerIds = (userId: string) =>
  db.select({ id: follows.followerId }).from(follows).where(eq(follows.followingId, userId))

// Ids the given user has blocked.
export const blockedByMe = (userId: string) =>
  db.select({ id: userBlocks.blockedId }).from(userBlocks).where(eq(userBlocks.blockerId, userId))

// Ids that have blocked the given user. Block visibility is symmetric — a read
// path that filters one direction and not the other leaks half the block.
export const blockedMe = (userId: string) =>
  db.select({ id: userBlocks.blockerId }).from(userBlocks).where(eq(userBlocks.blockedId, userId))

// Citywide rank (M7): how many people have ranked strictly more places than
// `myCount`, + 1. Same population as GET /leaderboard's own rows — not
// banned, a set handle, no block either way — so GET /me/stats's rankInDr
// and the leaderboard's myRank can never disagree on screen again (they used
// to: rankInDr counted every ranker in the table, unfiltered). Null-safe by
// the caller: pass myCount = 0 only when you already know to treat the
// result as "unranked", since this still returns 1 (nobody's ahead of zero).
export async function citywideRank(viewerId: string, myCount: number): Promise<number> {
  const ahead = await db
    .select({ userId: rankings.userId })
    .from(rankings)
    .innerJoin(user, eq(user.id, rankings.userId))
    .where(
      and(
        isNull(user.bannedAt),
        sql`${user.handle} is not null`,
        notInArray(user.id, blockedByMe(viewerId)),
        notInArray(user.id, blockedMe(viewerId)),
        // Private accounts count only for the people they have approved (F1) — the leaderboard's
        // own rule, so the two ranks still agree.
        authorVisibleTo(viewerId, user.id, user.isPrivate),
      ),
    )
    .groupBy(rankings.userId)
    .having(sql`count(${rankings.id}) > ${myCount}`)
  return ahead.length + 1
}

// Which ranking comments the given viewer may see: not moderation-removed, the
// author not banned, and no block either way. Shared by the thread read and the
// feed's count/latest-comment lookup so the two can never disagree. The caller
// must join `user` on rankingComments.userId (the ban check reads it).
export const visibleComment = (viewerId: string) =>
  and(
    isNull(rankingComments.removedAt),
    isNull(user.bannedAt),
    notInArray(rankingComments.userId, blockedByMe(viewerId)),
    notInArray(rankingComments.userId, blockedMe(viewerId)),
  )

// Private accounts (F1): a private member's content — their list, notes, dishes, taste match,
// who they follow — is for themselves and the people they've approved (`follows` rows only ever
// exist for approved followers; a pending request lives in `follow_requests`). Everything else
// about them (name, @handle, neighborhood, counts) stays visible so there is something to tap
// "Follow" on.
export async function canSeeContent(
  viewerId: string,
  target: { id: string; isPrivate: boolean },
): Promise<boolean> {
  if (!target.isPrivate || target.id === viewerId) return true
  const [row] = await db
    .select({ x: follows.followerId })
    .from(follows)
    .where(and(eq(follows.followerId, viewerId), eq(follows.followingId, target.id)))
    .limit(1)
  return Boolean(row)
}

// The same rule for a list query: rows whose author is open, is the viewer, or is followed by
// the viewer. `authorPrivate` is the author's `user.isPrivate` — the query has to join `user`
// for it (most already do, for the ban check).
export const authorVisibleTo = (viewerId: string, authorId: PgColumn, authorPrivate: PgColumn) =>
  or(eq(authorPrivate, false), eq(authorId, viewerId), inArray(authorId, followingIds(viewerId)))
