import { db, schema } from '@mesa/db'
import { APIError, createAuthMiddleware, getIp } from 'better-auth/api'
import { eq, sql } from 'drizzle-orm'
import { type AuthEventType, recordAuthEvent } from './authEvents'

// Per-account sign-in throttling.
//
// The IP limiter (auth.ts rateLimit) bounds flooding from one source, but it is
// the wrong primitive against credential stuffing: an attacker rotates IPs, and
// a whole office behind one NAT shares a bucket. This binds the limit to the
// credential actually under attack instead, so the cost of guessing a specific
// account's password rises no matter where the guesses come from.
//
// Escalating backoff rather than a hard lock. A hard lock is itself a denial of
// service — anyone who knows a member's email could keep them out permanently.
// Backoff makes sustained guessing impractical while a real user who fumbles
// their password a few times waits a minute, not forever.
const { authThrottle, user } = schema

// Failures are forgiven after a day of quiet, so one bad evening doesn't leave
// a lingering penalty on an account that is never attacked again.
export const FAILURE_DECAY_MS = 24 * 60 * 60 * 1000

// The first four attempts are free — fat fingers, a stale saved password, the
// wrong one of two accounts. Past that the wait grows fast.
export function lockMsFor(failures: number): number {
  if (failures < 5) return 0
  if (failures < 10) return 60_000 // 1 minute
  if (failures < 20) return 15 * 60_000 // 15 minutes
  return 60 * 60_000 // 1 hour
}

export type ThrottleRow = { failures: number; lastFailureAt: Date } | null

// Failures that still count, after the decay window.
export function effectiveFailures(row: ThrottleRow, now: number): number {
  if (!row) return 0
  return now - row.lastFailureAt.getTime() >= FAILURE_DECAY_MS ? 0 : row.failures
}

// How long the caller must wait, in ms. 0 means not locked.
export function retryAfterMs(row: ThrottleRow, now: number): number {
  if (!row) return 0
  const lock = lockMsFor(effectiveFailures(row, now))
  if (lock === 0) return 0
  return Math.max(0, row.lastFailureAt.getTime() + lock - now)
}

// Normalized so 'Ana@Mesa.do ' and 'ana@mesa.do' can't be used as two separate
// budgets against the same account.
export function throttleKey(email: string): string {
  return `signin:${email.trim().toLowerCase()}`
}

function emailFromBody(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const email = (body as { email?: unknown }).email
  return typeof email === 'string' && email.length > 0 ? email : null
}

const SIGN_IN_PATH = '/sign-in/email'

// Refuse a sign-in that is currently backed off, before any password check.
export const authThrottleBefore = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== SIGN_IN_PATH) return
  const email = emailFromBody(ctx.body)
  if (!email) return

  const [row] = await db
    .select({ failures: authThrottle.failures, lastFailureAt: authThrottle.lastFailureAt })
    .from(authThrottle)
    .where(eq(authThrottle.key, throttleKey(email)))
    .limit(1)

  const waitMs = retryAfterMs(row ?? null, Date.now())
  if (waitMs > 0) {
    const seconds = Math.ceil(waitMs / 1000)
    // Safe to be honest about the reason: an address with no account throttles
    // exactly like a real one, so this reveals nothing about who is a member.
    throw new APIError('TOO_MANY_REQUESTS', {
      message: `Demasiados intentos. Intenta de nuevo en ${seconds} segundos.`,
      retryAfter: seconds,
    })
  }
})

// The auth paths worth a permanent record. Kept to the events that answer
// "what happened to my account?" — see schema/auth.ts.
const AUDITED: Record<string, AuthEventType> = {
  '/sign-up/email': 'sign_up',
  '/reset-password': 'password_reset',
  '/change-password': 'password_changed',
  '/revoke-other-sessions': 'sessions_revoked',
  // No account_deleted here. Mesa deletes through its own DELETE /me, and every
  // auth_event row is ON DELETE CASCADE from the user — so a deletion event
  // would erase itself the moment it was written. That is the correct trade:
  // App Store 5.1.1 wants a real erase, not a tombstone with the member's IP.
}

// Count a failure, or clear the record on a clean sign-in. Also the one place
// that writes the audit trail, since it already runs after every auth call and
// can see whether it succeeded.
export const authThrottleAfter = createAuthMiddleware(async (ctx) => {
  const failedCall = ctx.context.returned instanceof APIError
  const ip = getIp(ctx.request ?? new Request('http://localhost'), ctx.context.options) ?? null
  const userAgent = ctx.request?.headers.get('user-agent') ?? null
  // A sign-in or sign-up puts the account on `newSession` (the session about to
  // be set); operations that require you to already be signed in — changing a
  // password, revoking sessions — put it on `session`. Reading only the latter
  // recorded every sign-in against a null user, which is most of the value.
  const actorId = ctx.context.newSession?.user.id ?? ctx.context.session?.user.id ?? null

  // Everything except sign-in, which needs the success/failure split below.
  const audited = AUDITED[ctx.path]
  if (audited && !failedCall) {
    recordAuthEvent({
      type: audited,
      userId: actorId,
      ip,
      userAgent,
    })
  }

  if (ctx.path !== SIGN_IN_PATH) return
  const email = emailFromBody(ctx.body)
  if (!email) return
  const key = throttleKey(email)

  // A rejected sign-in leaves an APIError here; a successful one leaves the
  // session payload.
  const failed = failedCall
  // Recorded either way. A failed attempt is resolved back to the account it
  // targeted — otherwise the row says only "someone failed a sign-in from this
  // IP", which cannot answer the question this table exists for: "did somebody
  // try to get into MY account?". One indexed lookup on a unique column, on a
  // path that is already rate limited per IP and per account. Stays null when
  // the address has no account, which is itself the useful signal.
  const targetId = failed
    ? ((
        await db
          .select({ id: user.id })
          .from(user)
          .where(eq(user.email, email.trim().toLowerCase()))
          .limit(1)
      )[0]?.id ?? null)
    : actorId
  recordAuthEvent({
    type: failed ? 'sign_in_failed' : 'sign_in',
    userId: targetId,
    ip,
    userAgent,
  })
  if (!failed) {
    await db.delete(authThrottle).where(eq(authThrottle.key, key))
    return
  }

  const now = new Date()
  await db
    .insert(authThrottle)
    .values({ key, failures: 1, lastFailureAt: now })
    .onConflictDoUpdate({
      target: authThrottle.key,
      set: {
        // Restart the count when the previous failure has aged out, so the
        // decay window is honoured on write as well as on read.
        failures: sql`case when ${authThrottle.lastFailureAt} < ${new Date(now.getTime() - FAILURE_DECAY_MS)} then 1 else ${authThrottle.failures} + 1 end`,
        lastFailureAt: now,
      },
    })
})
