import { db, schema } from '@mesa/db'
import { and, eq, inArray, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'

import type { AuthedEnv } from '../context'
import { notify } from '../lib/notify'
import { canSeeContent } from '../lib/visibility'
import { requireAuth } from '../middleware/session'

// Cheers (🥂) — the one-tap reaction to a friend's ranking. Idempotent both
// ways; the feed carries the counts.
const { cheers, notifications, rankings, user, userBlocks } = schema

const uuid = z.string().uuid()

const cheerKey = (rankingId: string, actorId: string) => `cheers:${rankingId}:${actorId}`

export const cheersRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)

  .post('/:rankingId', async (c) => {
    const me = c.get('user')
    const rankingId = c.req.param('rankingId')
    if (!uuid.safeParse(rankingId).success) return c.json({ error: 'not_found' }, 404)
    const [exists] = await db
      .select({
        id: rankings.id,
        userId: rankings.userId,
        restaurantId: rankings.restaurantId,
        ownerPrivate: user.isPrivate,
        ownerBanned: user.bannedAt,
      })
      .from(rankings)
      .innerJoin(user, eq(user.id, rankings.userId))
      .where(eq(rankings.id, rankingId))
      .limit(1)
    if (!exists || exists.ownerBanned) return c.json({ error: 'not_found' }, 404)
    // A private account's rankings are for its approved followers: holding the id is not enough.
    if (
      exists.userId !== me.id &&
      !(await canSeeContent(me.id, { id: exists.userId, isPrivate: exists.ownerPrivate }))
    ) {
      return c.json({ error: 'not_found' }, 404)
    }
    // A block is symmetric: if either of us blocked the other, I can't cheer
    // their ranking (otherwise a blocked user reappears in the owner's bell —
    // a block bypass the activity read now also filters).
    if (exists.userId !== me.id) {
      const blocked = await db.query.userBlocks.findFirst({
        where: or(
          and(eq(userBlocks.blockerId, me.id), eq(userBlocks.blockedId, exists.userId)),
          and(eq(userBlocks.blockerId, exists.userId), eq(userBlocks.blockedId, me.id)),
        ),
        columns: { blockerId: true },
      })
      if (blocked) return c.json({ error: 'not_found' }, 404)
    }
    await db.insert(cheers).values({ userId: me.id, rankingId }).onConflictDoNothing()

    // One inbox row per (ranking, friend); a repeat tap finds it there. The push is
    // throttled to ≤1 per ranking per hour in KIND_RULES.
    notify([
      {
        userId: exists.userId,
        kind: 'cheers',
        dedupeKey: cheerKey(rankingId, me.id),
        actorId: me.id,
        rankingId,
        restaurantId: exists.restaurantId,
      },
    ])

    return c.json({ ok: true })
  })

  .delete('/:rankingId', async (c) => {
    const me = c.get('user')
    const rankingId = c.req.param('rankingId')
    if (!uuid.safeParse(rankingId).success) return c.json({ error: 'not_found' }, 404)
    await db.delete(cheers).where(and(eq(cheers.userId, me.id), eq(cheers.rankingId, rankingId)))
    // An un-cheer takes its bell entry with it (the owner's row, found through the ranking
    // and the unique key, so this is one indexed delete).
    await db
      .delete(notifications)
      .where(
        and(
          eq(notifications.dedupeKey, cheerKey(rankingId, me.id)),
          inArray(
            notifications.userId,
            db.select({ id: rankings.userId }).from(rankings).where(eq(rankings.id, rankingId)),
          ),
        ),
      )
    return c.json({ ok: true })
  })
