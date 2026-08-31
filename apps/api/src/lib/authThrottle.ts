import { db, schema } from '@mesa/db'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { eq, sql } from 'drizzle-orm'

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
const { authThrottle } = schema

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

// Count a failure, or clear the record on a clean sign-in.
export const authThrottleAfter = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== SIGN_IN_PATH) return
  const email = emailFromBody(ctx.body)
  if (!email) return
  const key = throttleKey(email)

  // A rejected sign-in leaves an APIError here; a successful one leaves the
  // session payload.
  const failed = ctx.context.returned instanceof APIError
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
