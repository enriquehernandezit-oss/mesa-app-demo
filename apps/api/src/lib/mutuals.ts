import { db, schema } from '@mesa/db'
import { and, desc, eq, inArray, isNull, lte, ne, notInArray, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { authorVisibleTo, blockedByMe, blockedMe, followerIds, followingIds } from './visibility'

const { follows, user, neighborhoods } = schema

// "People you both know" — for a person T, which of MY people also follow T.
//
//   my people = the people I follow ∪ the people who follow me
//   a mutual of T = one of my people with a `follows` row onto T
//
// The connection runs both ways on purpose: someone who follows me is a person I know, even if I
// haven't followed back. A mutual is left out (and not counted, so the count can't give them away)
// when they are me, banned, blocked either way, or a private account I'm not approved on — "Ana
// follows T" is part of Ana's own list, which a private account keeps for her approved followers.
//
// A query that uses this joins `follows` (the edge M → T) to `user` on follows.followerId (M).
function mutualFollowers(viewerId: string) {
  return and(
    ne(follows.followerId, viewerId),
    isNull(user.bannedAt),
    notInArray(user.id, blockedByMe(viewerId)),
    notInArray(user.id, blockedMe(viewerId)),
    or(
      inArray(follows.followerId, followingIds(viewerId)),
      inArray(follows.followerId, followerIds(viewerId)),
    ),
    authorVisibleTo(viewerId, user.id, user.isPrivate),
  )
}

export const MUTUAL_SAMPLE = 3

export type MutualPerson = { id: string; name: string; image: string | null }
export type MutualSummary = { count: number; sample: MutualPerson[] }
export const NO_MUTUALS: MutualSummary = { count: 0, sample: [] }

// How many mutuals each target has, and the first few to show as faces — people I follow first,
// then the most recent follows. One query for any number of targets. Targets with none are absent
// from the map. The caller has already excluded banned and blocked targets.
export async function mutualSummaries(
  viewerId: string,
  targetIds: string[],
): Promise<Map<string, MutualSummary>> {
  const out = new Map<string, MutualSummary>()
  if (targetIds.length === 0) return out

  const iFollow = alias(follows, 'i_follow')
  const ranked = db
    .select({
      targetId: follows.followingId,
      id: user.id,
      name: user.name,
      image: user.image,
      total: sql<number>`(count(*) over (partition by ${follows.followingId}))::int`.as('total'),
      rn: sql<number>`(row_number() over (
        partition by ${follows.followingId}
        order by (${iFollow.followerId} is not null) desc, ${follows.createdAt} desc, ${user.id}
      ))::int`.as('rn'),
    })
    .from(follows)
    .innerJoin(user, eq(user.id, follows.followerId))
    .leftJoin(
      iFollow,
      and(eq(iFollow.followerId, viewerId), eq(iFollow.followingId, follows.followerId)),
    )
    .where(and(inArray(follows.followingId, targetIds), mutualFollowers(viewerId)))
    .as('ranked')

  const rows = await db
    .select()
    .from(ranked)
    .where(lte(ranked.rn, MUTUAL_SAMPLE))
    .orderBy(ranked.targetId, ranked.rn)
  for (const r of rows) {
    const entry = out.get(r.targetId) ?? { count: r.total, sample: [] }
    entry.sample.push({ id: r.id, name: r.name, image: r.image })
    out.set(r.targetId, entry)
  }
  return out
}

// The whole list behind "Followed by Ana, Luis and 3 more" — the same people, as rows the Follow
// button works on. People I follow first, then the most recent follows.
export async function mutualList(viewerId: string, targetId: string) {
  const iFollow = alias(follows, 'i_follow')
  return db
    .select({
      id: user.id,
      name: user.name,
      handle: user.handle,
      image: user.image,
      neighborhood: neighborhoods.name,
      isFollowing: sql<boolean>`${iFollow.followerId} is not null`,
    })
    .from(follows)
    .innerJoin(user, eq(user.id, follows.followerId))
    .leftJoin(neighborhoods, eq(neighborhoods.id, user.neighborhoodId))
    .leftJoin(
      iFollow,
      and(eq(iFollow.followerId, viewerId), eq(iFollow.followingId, follows.followerId)),
    )
    .where(and(eq(follows.followingId, targetId), mutualFollowers(viewerId)))
    .orderBy(sql`(${iFollow.followerId} is not null) desc`, desc(follows.createdAt), user.id)
    .limit(200)
}

// Candidates for "people you may know": everyone one of my people follows that I don't, with how
// many of my people that is. The caller adds its own exclusions (dismissed, blocked, banned).
export function mutualCandidateCount(viewerId: string) {
  return {
    where: mutualFollowers(viewerId),
    count: sql<number>`count(distinct ${follows.followerId})::int`,
  }
}
