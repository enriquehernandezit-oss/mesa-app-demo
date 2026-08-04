import { db, schema } from '@mesa/db'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppEnv } from '../context'
import { requireAuth } from '../middleware/session'

// Authed profile route. The user + their neighborhood come back in ONE round
// trip via a Drizzle relational query — the pattern every list/feed endpoint
// follows (no N+1).
export const meRoutes = new Hono<AppEnv>().use(requireAuth).get('/', async (c) => {
  const current = c.get('user')
  if (!current) return c.json({ error: 'unauthorized' }, 401) // narrows the type

  const profile = await db.query.user.findFirst({
    where: eq(schema.user.id, current.id),
    columns: { id: true, name: true, handle: true, bio: true, image: true },
    with: {
      neighborhood: { columns: { slug: true, name: true } },
    },
  })

  return c.json({ profile })
})
