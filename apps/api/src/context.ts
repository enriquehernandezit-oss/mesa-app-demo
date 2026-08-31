import type { auth } from './auth'

// The session shape Better Auth infers from our config (user + session).
type SessionData = typeof auth.$Infer.Session

// Hono environment: every request carries the current user + session (or null).
// The session middleware populates these on every request; a logged-out request
// leaves them null.
export type AppEnv = {
  Variables: {
    user: SessionData['user'] | null
    session: SessionData['session'] | null
  }
}

// The environment behind `requireAuth`: the guard has already rejected the
// null case, so `c.get('user')` is non-null. Routes mounted behind requireAuth
// are typed with this so handlers skip the `if (!me) return 401` narrowing.
export type AuthedEnv = {
  Variables: {
    user: SessionData['user']
    session: SessionData['session'] | null
  }
}
