import { db, schema } from '@mesa/db'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppEnv } from '../context'
import { requireAuth } from '../middleware/session'

// Cheers (🥂) — the one-tap reaction to a friend's ranking. Idempotent both
// ways; the feed carries the counts.
const { cheers, rankings } = schema

export const cheersRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  .post('/:rankingId', async (c) => {
    const me = c.get('user')
    if (!me) return c.json({ error: 'unauthorized' }, 401)
    const rankingId = c.req.param('rankingId')
    const exists = await db.query.rankings.findFirst({
      where: eq(rankings.id, rankingId),
      columns: { id: true },
    })
    if (!exists) return c.json({ error: 'not_found' }, 404)
    await db.insert(cheers).values({ userId: me.id, rankingId }).onConflictDoNothing()
    return c.json({ ok: true })
  })

  .delete('/:rankingId', async (c) => {
    const me = c.get('user')
    if (!me) return c.json({ error: 'unauthorized' }, 401)
    await db
      .delete(cheers)
      .where(and(eq(cheers.userId, me.id), eq(cheers.rankingId, c.req.param('rankingId'))))
    return c.json({ ok: true })
  })
