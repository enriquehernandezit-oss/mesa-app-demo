import { createMiddleware } from 'hono/factory'
import { auth } from '../auth'
import type { AppEnv, AuthedEnv } from '../context'

// Resolves the Better Auth session once per request and puts the current user +
// session on the context. Runs everywhere; it never rejects — it just populates
// (or leaves null). Route-level protection is requireAuth's job.
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers })
  c.set('user', result?.user ?? null)
  c.set('session', result?.session ?? null)
  await next()
})

// Guard for authed routes: 401 unless a user is present. Also the ban gate
// (App Store 1.2 — ejected users): a banned account is rejected everywhere and
// its session is cleared. Typed with AuthedEnv so routes behind it read a
// non-null c.get('user').
export const requireAuth = createMiddleware<AuthedEnv>(async (c, next) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  if (user.bannedAt) {
    await auth.api.signOut({ headers: c.req.raw.headers }).catch(() => {})
    return c.json({ error: 'account_suspended' }, 403)
  }
  await next()
})

// Guard for moderation actions (remove content / eject users). Must run after
// requireAuth. Only accounts flagged isModerator may pass.
export const requireModerator = createMiddleware<AuthedEnv>(async (c, next) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  if (!user.isModerator) return c.json({ error: 'forbidden' }, 403)
  await next()
})
