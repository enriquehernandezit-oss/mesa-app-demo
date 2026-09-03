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

  // Resolve a public @handle to a user id. Shared profile links address people by
  // handle (`/p/u/@ana`), but every in-app profile route is keyed by id — so the
  // app hits this once when a shared link opens, then navigates to /u/<id>.
  // Exact match only: this is link resolution, not search (that lives in the
  // explore endpoint and is deliberately fuzzy).
  .get('/by-handle/:handle', async (c) => {
    const handle = c.req.param('handle').replace(/^@/, '').toLowerCase()
    if (!handle) return c.json({ error: 'not_found' }, 404)

    const target = await db.query.user.findFirst({
      where: eq(schema.user.handle, handle),
      columns: { id: true, bannedAt: true },
    })
    // A banned account's link resolves to nothing rather than a dead profile.
    if (!target || target.bannedAt) return c.json({ error: 'not_found' }, 404)

    return c.json({ userId: target.id })
  })
