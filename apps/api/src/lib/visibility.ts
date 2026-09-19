import { db, schema } from '@mesa/db'
import { and, eq, isNull, notInArray } from 'drizzle-orm'

const { follows, userBlocks, rankingComments, user } = schema

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
