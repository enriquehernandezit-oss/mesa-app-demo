import { db, schema } from '@mesa/db'
import { and, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { auth } from '../auth'
import type { AuthedEnv } from '../context'
import { requireAuth } from '../middleware/session'

// The authed user's own profile + onboarding gate. The app calls GET /me on
// launch to decide: send them to onboarding, or into the tab shell.
//
// onboardingComplete is derived, not stored — it is true once the user has a
// handle, a neighborhood, an accepted EULA, and at least one ranking. All of
// that comes back in ONE relational round trip (the neighborhood via a join,
// "has a ranking" via a limit-1 relation), so there is no N+1 and no extra
// count query.

const profileSchema = z.object({
  name: z.string().trim().min(1).max(60),
  // Instagram @handle is optional — membership doesn't require a social identity.
  // When present it must be well-formed and unique; when omitted it stays null.
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.]{2,30}$/, 'handle must be 2–30 chars: a–z, 0–9, _ or .')
    .optional(),
  neighborhoodSlug: z.string().trim().min(1),
  bio: z.string().trim().max(160).optional(),
  acceptEula: z.literal(true), // must be explicitly accepted (App Store 1.2)
})

// Matches Better Auth's session.freshAge default (1 day) — the same bar it
// applies to its own sensitive operations.
const FRESH_SESSION_MS = 24 * 60 * 60 * 1000

// Password is optional in the body because accounts without one prove identity
// with a fresh session instead.
const deleteSchema = z.object({ password: z.string().min(1).max(128).optional() })

const linkEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
})

export const meRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)
  .get('/', async (c) => {
    const current = c.get('user')

    const row = await db.query.user.findFirst({
      where: eq(schema.user.id, current.id),
      columns: {
        id: true,
        name: true,
        handle: true,
        bio: true,
        image: true,
        email: true,
        emailVerified: true,
        neighborhoodId: true,
        eulaAcceptedAt: true,
        createdAt: true, // "Member since {month} {year}" on the profile (Phase 6)
      },
      with: {
        neighborhood: { columns: { slug: true, name: true } },
        // Just enough to know whether they have ranked anything at all.
        rankings: { columns: { id: true }, limit: 1 },
      },
    })
    if (!row) return c.json({ error: 'not_found' }, 404)

    const { rankings, eulaAcceptedAt, neighborhoodId, ...profile } = row
    // Handle (Instagram) is optional, so it's no longer part of the gate —
    // a neighborhood, an accepted EULA, and at least one ranking complete it.
    const onboardingComplete =
      Boolean(neighborhoodId) && Boolean(eulaAcceptedAt) && rankings.length > 0

    return c.json({
      profile: { ...profile, neighborhood: row.neighborhood },
      onboardingComplete,
    })
  })
  // Completes the profile step of onboarding: name, @handle, neighborhood, EULA.
  // Runs last in the onboarding flow, so its success is what flips the gate.
  .patch('/profile', async (c) => {
    const current = c.get('user')

    const parsed = profileSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
    }
    const { name, handle, neighborhoodSlug, bio } = parsed.data

    const neighborhood = await db.query.neighborhoods.findFirst({
      where: eq(schema.neighborhoods.slug, neighborhoodSlug),
      columns: { id: true },
    })
    if (!neighborhood) return c.json({ error: 'unknown_neighborhood' }, 400)

    // Handle uniqueness is enforced by the DB unique constraint; catch the
    // collision and return a clean 409 instead of a 500. Handle is only written
    // when provided — an omitted handle leaves the column null (optional).
    try {
      await db
        .update(schema.user)
        .set({
          name,
          ...(handle ? { handle } : {}),
          neighborhoodId: neighborhood.id,
          bio: bio ?? null,
          eulaAcceptedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.user.id, current.id))
    } catch (err) {
      if (err instanceof Error && err.message.includes('user_handle_unique')) {
        return c.json({ error: 'handle_taken' }, 409)
      }
      throw err
    }

    return c.json({ ok: true })
  })
  // Upgrade a phone/OAuth-first account with email + password sign-in. These
  // accounts carry a placeholder inbox (<digits>@phone.mesa.local) and no
  // credential, so there's no current password to check — setting the first one
  // is privileged, hence server-side via Better Auth's setPassword (not the
  // client changePassword, which requires the existing password). The gate is
  // "has no credential account yet"; once linked, the real change-password /
  // change-email flows apply instead. The new email lands unverified — the user
  // confirms it from the same Settings screen.
  .post('/link-email', async (c) => {
    const current = c.get('user')

    const parsed = linkEmailSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
    }
    const { email, password } = parsed.data

    // Already has a password? Then this is the wrong path (use change-password).
    const cred = await db.query.account.findFirst({
      where: and(
        eq(schema.account.userId, current.id),
        eq(schema.account.providerId, 'credential'),
      ),
      columns: { id: true },
    })
    if (cred) return c.json({ error: 'already_linked' }, 409)

    // The email must be free (unique constraint also guards this).
    const taken = await db.query.user.findFirst({
      where: eq(schema.user.email, email),
      columns: { id: true },
    })
    if (taken && taken.id !== current.id) return c.json({ error: 'email_taken' }, 409)

    // Point the account at the real email first (unverified), then set the first
    // password — so the credential is created against the correct address. If the
    // password step fails, the credential still doesn't exist, so a retry is clean.
    await db
      .update(schema.user)
      .set({ email, emailVerified: false, updatedAt: new Date() })
      .where(eq(schema.user.id, current.id))
    try {
      await auth.api.setPassword({ body: { newPassword: password }, headers: c.req.raw.headers })
    } catch {
      return c.json({ error: 'set_password_failed' }, 400)
    }

    return c.json({ ok: true })
  })
  // Stats for the profile + rankings headers and the Taste Profile card:
  // counts, average, current weekly streak, top cuisine/neighborhood. One
  // rankings read + two count queries — fixed round trips.
  .get('/stats', async (c) => {
    const current = c.get('user')

    const mine = await db
      .select({
        score: schema.rankings.score,
        createdAt: schema.rankings.createdAt,
        cuisine: schema.restaurants.cuisine,
        neighborhood: schema.neighborhoods.name,
      })
      .from(schema.rankings)
      .innerJoin(schema.restaurants, eq(schema.restaurants.id, schema.rankings.restaurantId))
      .leftJoin(
        schema.neighborhoods,
        eq(schema.neighborhoods.id, schema.restaurants.neighborhoodId),
      )
      .where(eq(schema.rankings.userId, current.id))

    const followers = await db.$count(schema.follows, eq(schema.follows.followingId, current.id))
    const followingCount = await db.$count(
      schema.follows,
      eq(schema.follows.followerId, current.id),
    )

    // Current streak: consecutive ISO weeks (ending this week) with ≥1 ranking.
    const WEEK = 7 * 24 * 60 * 60 * 1000
    const weeks = new Set(mine.map((r) => Math.floor(r.createdAt.getTime() / WEEK)))
    const thisWeek = Math.floor(Date.now() / WEEK)
    let streak = 0
    for (let w = thisWeek; weeks.has(w); w--) streak++

    const top = (values: (string | null)[]): string | null => {
      const counts = new Map<string, number>()
      for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
      let best: string | null = null
      let bestN = 0
      for (const [k, n] of counts) if (n > bestN) [best, bestN] = [k, n]
      return best
    }

    // City rank (same ordering as the leaderboard): how many people have ranked
    // more places than me, + 1. Null until I've ranked anything.
    let rankInDr: number | null = null
    if (mine.length > 0) {
      const rankRes = await db.execute(sql`
        SELECT count(*)::int AS ahead
        FROM (
          SELECT user_id FROM rankings GROUP BY user_id HAVING count(*) > ${mine.length}
        ) t
      `)
      const ahead = Number((rankRes.rows[0] as { ahead: number } | undefined)?.ahead ?? 0)
      rankInDr = ahead + 1
    }

    return c.json({
      places: mine.length,
      followers,
      following: followingCount,
      streakWeeks: streak,
      rankInDr,
      avgScore: mine.length ? mine.reduce((s, r) => s + r.score, 0) / mine.length : null,
      topCuisine: top(mine.map((r) => r.cuisine)),
      topNeighborhood: top(mine.map((r) => r.neighborhood)),
    })
  })
  // Avatar: the client resizes to a small JPEG and sends a data URL (Cloudinary
  // replaces this path at launch; the column already holds any URL). Size-capped.
  .patch('/avatar', async (c) => {
    const current = c.get('user')
    const body = (await c.req.json().catch(() => null)) as { image?: string } | null
    const image = body?.image
    if (
      typeof image !== 'string' ||
      !image.startsWith('data:image/jpeg;base64,') ||
      image.length > 80_000
    ) {
      return c.json({ error: 'invalid_image' }, 400)
    }
    await db
      .update(schema.user)
      .set({ image, updatedAt: new Date() })
      .where(eq(schema.user.id, current.id))
    return c.json({ ok: true })
  })
  // In-app account deletion (App Store 5.1.1). Deleting the user row cascades
  // across everything they own — rankings, vibe notes, follows, blocks, saved
  // places, reports, and Better Auth's own sessions + accounts (every child FK
  // is ON DELETE CASCADE). This is a real erase, not a deactivate. The client
  // then clears its session and returns to the sign-in screen.
  //
  // Because it is irreversible and cannot be undone by support, it now demands
  // proof that the person holding the phone is the account owner — a two-tap
  // confirm in the UI is not that. Anyone with a borrowed unlocked phone could
  // previously erase an account permanently.
  //
  // The proof matches how the account signs in: a password where one exists,
  // and otherwise a session created recently enough that the OS/provider login
  // is still fresh (Better Auth's freshAge, 1 day).
  .delete('/', async (c) => {
    const current = c.get('user')
    const session = c.get('session')
    const parsed = deleteSchema.safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

    const [credential] = await db
      .select({ id: schema.account.id })
      .from(schema.account)
      .where(
        and(eq(schema.account.userId, current.id), eq(schema.account.providerId, 'credential')),
      )
      .limit(1)

    if (credential) {
      const password = parsed.data.password
      if (!password) return c.json({ error: 'password_required' }, 400)
      try {
        // Throws INVALID_PASSWORD on a mismatch. Reads the current session from
        // the forwarded headers, so it can only ever check the caller's own.
        await auth.api.verifyPassword({
          body: { password },
          headers: c.req.raw.headers,
        })
      } catch {
        return c.json({ error: 'invalid_password' }, 403)
      }
    } else if (!session || Date.now() - session.createdAt.getTime() > FRESH_SESSION_MS) {
      // Apple/Instagram/phone accounts have no password to check, so the bar is
      // a recent sign-in instead. The client asks them to sign in again.
      return c.json({ error: 'session_not_fresh' }, 403)
    }

    await db.delete(schema.user).where(eq(schema.user.id, current.id))
    return c.json({ ok: true })
  })
