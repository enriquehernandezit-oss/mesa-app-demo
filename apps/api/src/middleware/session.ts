import { createMiddleware } from 'hono/factory'
import { auth } from '../auth'
import type { AppEnv } from '../context'

// Resolves the Better Auth session once per request and puts the current user +
// session on the context. Runs everywhere; it never rejects — it just populates
// (or leaves null). Route-level protection is requireAuth's job.
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers })
  c.set('user', result?.user ?? null)
  c.set('session', result?.session ?? null)
  await next()
})

// Guard for authed routes: 401 unless a user is present. After this runs,
// c.get('user') is guaranteed non-null within the handler.
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('user')) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  await next()
})
