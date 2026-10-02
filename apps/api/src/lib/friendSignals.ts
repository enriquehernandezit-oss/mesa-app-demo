import { db, schema, tasteMatch } from '@mesa/db'
import { sql } from 'drizzle-orm'

import { type NotifyInput, background, notifyNow } from './notify'

// The two "friends" signals: a place the people you follow love, and a mutual follow whose taste
// is nearly yours. Both are a SQL aggregate over rankings + follows (no looping a query per
// friend) feeding pure functions, so the rules are unit-tested without a database. They produce
// NotifyInputs; lib/notify.ts writes the inbox rows and sends the pushes.

// "Friends love it": at least this many of the people YOU follow ranked a place this high, within
// this many days, tells you about it. Scores are list positions (72–96), so 80 is "8.0 and up".
export const LOVE_SCORE = 80
export const LOVE_MIN_FRIENDS = 3
export const LOVE_WINDOW_DAYS = 30

// The match (taste_match, 0–100) at which a pair of people who FOLLOW EACH OTHER is worth a
// notification (a one-way follow never is: it would tell someone about a stranger's taste). Damped for small samples (packages/db tasteMatch.ts), so 90 needs a long shared
// history — 8 shared places at an identical order is the least that reaches it.
export const TASTE_PUSH_AT = 90

type Executor = Pick<typeof db, 'execute'>

// ── friends love it ──────────────────────────────────────────────────────

export interface LoveRecipient {
  userId: string
  // How many of the people they follow ranked it LOVE_SCORE+ in the window.
  friends: number
  // They have ranked it themselves.
  went: boolean
}

// Of the people who follow `rankerId`, those with LOVE_MIN_FRIENDS+ followees who love the place —
// the ranker counts as one of them when their own ranking qualifies. Banned people don't count
// and aren't told. One query.
export async function loveRecipients(
  rankerId: string,
  restaurantId: string,
  conn: Executor = db,
): Promise<LoveRecipient[]> {
  const res = await conn.execute(sql`
    select f.follower_id as user_id, count(*)::int as friends, bool_or(mine.user_id is not null) as went
    from ${schema.follows} f
    join ${schema.rankings} r
      on r.user_id = f.following_id
     and r.restaurant_id = ${restaurantId}
     and r.score >= ${LOVE_SCORE}
     and r.created_at > now() - make_interval(days => ${LOVE_WINDOW_DAYS})
    join ${schema.user} lover on lover.id = f.following_id and lover.banned_at is null
    join ${schema.user} reader on reader.id = f.follower_id and reader.banned_at is null
    left join ${schema.rankings} mine
      on mine.user_id = f.follower_id and mine.restaurant_id = ${restaurantId}
    where f.follower_id in (select follower_id from ${schema.follows} where following_id = ${rankerId})
    group by f.follower_id
    having count(*) >= ${LOVE_MIN_FRIENDS}
  `)
  return (res.rows as { user_id: string; friends: number; went: boolean }[]).map((r) => ({
    userId: r.user_id,
    friends: r.friends,
    went: r.went,
  }))
}

// Once per place per person, ever: the key is what the event IS.
export function loveInputs(restaurantId: string, recipients: LoveRecipient[]): NotifyInput[] {
  return recipients.map((r) => ({
    userId: r.userId,
    kind: 'friends_love' as const,
    dedupeKey: `friends_love:${restaurantId}`,
    restaurantId,
    data: { count: r.friends, went: r.went },
  }))
}

// ── taste match ──────────────────────────────────────────────────────────

// One direction of a MUTUAL follow: `follower` follows `following` and is followed back, and over
// the places both have ranked the average score gap is `gap`. A mutual pair is two TastePairs.
export interface TastePair {
  follower: string
  following: string
  shared: number
  gap: number
}

// Every mutual follow touching `userId`, each as its two directions, with the shared-places
// aggregate — or every mutual follow in the app when no one is named (the backfill). Pairs below the match's own
// minimum of shared places come back too; tasteMatch() answers null for them.
export async function tastePairs(userId?: string, conn: Executor = db): Promise<TastePair[]> {
  const res = await conn.execute(sql`
    select f.follower_id, f.following_id, count(*)::int as shared,
           avg(abs(a.score - b.score))::float as gap
    from ${schema.follows} f
    join ${schema.follows} back
      on back.follower_id = f.following_id and back.following_id = f.follower_id
    join ${schema.rankings} a on a.user_id = f.follower_id
    join ${schema.rankings} b on b.user_id = f.following_id and b.restaurant_id = a.restaurant_id
    ${userId ? sql`where f.follower_id = ${userId} or f.following_id = ${userId}` : sql``}
    group by f.follower_id, f.following_id
  `)
  return (
    res.rows as { follower_id: string; following_id: string; shared: number; gap: number }[]
  ).map((r) => ({
    follower: r.follower_id,
    following: r.following_id,
    shared: r.shared,
    gap: r.gap,
  }))
}

// The pairs at TASTE_PUSH_AT or more, each told to the `follower` about the `following`: "you and
// Ana are now a 92% match" goes to each of the two about the other. Once ever per (recipient,
// person).
export function tasteInputs(pairs: TastePair[]): NotifyInput[] {
  return pairs.flatMap((p) => {
    const percent = tasteMatch(p.gap, p.shared)
    if (percent === null || percent < TASTE_PUSH_AT) return []
    return [
      {
        userId: p.follower,
        kind: 'taste_match' as const,
        dedupeKey: `taste_match:${p.following}`,
        actorId: p.following,
        data: { percent },
      },
    ]
  })
}

// ── after a ranking is written ───────────────────────────────────────────

// What a ranking can set off: the place may now be one that three of the ranker's followers'
// friends love, and the ranker's scores moved against everyone they share places with, so a
// pair may have crossed the match line. Fire-and-forget by the notify() convention — called
// without await from the route, never able to fail or slow the write.
export function signalsAfterRanking(rankerId: string, restaurantId: string): void {
  background(async () => {
    const [mine] = (
      await db.execute(sql`
        select score from ${schema.rankings}
        where user_id = ${rankerId} and restaurant_id = ${restaurantId}
      `)
    ).rows as { score: number }[]
    const loved =
      mine && mine.score >= LOVE_SCORE
        ? loveInputs(restaurantId, await loveRecipients(rankerId, restaurantId))
        : []
    await notifyNow([...loved, ...tasteInputs(await tastePairs(rankerId))])
  }, 'friend signals failed')
}
