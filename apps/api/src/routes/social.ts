import { db, schema } from '@mesa/db'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthedEnv } from '../context'
import { requireAuth } from '../middleware/session'

// The social graph write side. Follow/unfollow is used first during onboarding
// friend-find; the discovery feed that reads this graph lands in M4.

const followSchema = z.object({ userId: z.string().min(1) })

export const socialRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)

  .post('/follow', async (c) => {
    const current = c.get('user')

    const parsed = followSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)
    if (parsed.data.userId === current.id) {
      return c.json({ error: 'cannot_follow_self' }, 400)
    }

    // Idempotent: following someone you already follow is a no-op, not an error.
    await db
      .insert(schema.follows)
      .values({ followerId: current.id, followingId: parsed.data.userId })
      .onConflictDoNothing()

    return c.json({ ok: true })
  })

  .delete('/follow/:userId', async (c) => {
    const current = c.get('user')

    await db
      .delete(schema.follows)
      .where(
        and(
          eq(schema.follows.followerId, current.id),
          eq(schema.follows.followingId, c.req.param('userId')),
        ),
      )

    return c.json({ ok: true })
  })
