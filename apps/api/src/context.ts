import type { auth } from './auth'

// The session shape Better Auth infers from our config (user + session).
type SessionData = typeof auth.$Infer.Session

// Hono environment: every request carries the current user + session (or null).
// Route handlers read c.get('user'); requireAuth guarantees it is non-null.
export type AppEnv = {
  Variables: {
    user: SessionData['user'] | null
    session: SessionData['session'] | null
  }
}
