import { db, schema } from '@mesa/db'
import { and, eq, or } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AuthedEnv } from '../context'
import { requireAuth } from '../middleware/session'

// Cheers (🥂) — the one-tap reaction to a friend's ranking. Idempotent both
// ways; the feed carries the counts.
const { cheers, rankings, userBlocks } = schema

export const cheersRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)

  .post('/:rankingId', async (c) => {
    const me = c.get('user')
    const rankingId = c.req.param('rankingId')
    const exists = await db.query.rankings.findFirst({
      where: eq(rankings.id, rankingId),
      columns: { id: true, userId: true },
    })
    if (!exists) return c.json({ error: 'not_found' }, 404)
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
    return c.json({ ok: true })
  })

  .delete('/:rankingId', async (c) => {
    const me = c.get('user')
    await db
      .delete(cheers)
      .where(and(eq(cheers.userId, me.id), eq(cheers.rankingId, c.req.param('rankingId'))))
    return c.json({ ok: true })
  })
