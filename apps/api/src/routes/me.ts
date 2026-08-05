import { db, schema } from '@mesa/db'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../context'
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
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.]{2,30}$/, 'handle must be 2–30 chars: a–z, 0–9, _ or .'),
  neighborhoodSlug: z.string().trim().min(1),
  bio: z.string().trim().max(160).optional(),
  acceptEula: z.literal(true), // must be explicitly accepted (App Store 1.2)
})

export const meRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get('/', async (c) => {
    const current = c.get('user')
    if (!current) return c.json({ error: 'unauthorized' }, 401) // narrows type

    const row = await db.query.user.findFirst({
      where: eq(schema.user.id, current.id),
      columns: {
        id: true,
        name: true,
        handle: true,
        bio: true,
        image: true,
        neighborhoodId: true,
        eulaAcceptedAt: true,
      },
      with: {
        neighborhood: { columns: { slug: true, name: true } },
        // Just enough to know whether they have ranked anything at all.
        rankings: { columns: { id: true }, limit: 1 },
      },
    })
    if (!row) return c.json({ error: 'not_found' }, 404)

    const { rankings, eulaAcceptedAt, neighborhoodId, ...profile } = row
    const onboardingComplete =
      Boolean(profile.handle) &&
      Boolean(neighborhoodId) &&
      Boolean(eulaAcceptedAt) &&
      rankings.length > 0

    return c.json({
      profile: { ...profile, neighborhood: row.neighborhood },
      onboardingComplete,
    })
  })
  // Completes the profile step of onboarding: name, @handle, neighborhood, EULA.
  // Runs last in the onboarding flow, so its success is what flips the gate.
  .patch('/profile', async (c) => {
    const current = c.get('user')
    if (!current) return c.json({ error: 'unauthorized' }, 401)

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
    // collision and return a clean 409 instead of a 500.
    try {
      await db
        .update(schema.user)
        .set({
          name,
          handle,
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
  // Stats for the profile + rankings headers and the Taste Profile card:
  // counts, average, current weekly streak, top cuisine/neighborhood. One
  // rankings read + two count queries — fixed round trips.
  .get('/stats', async (c) => {
    const current = c.get('user')
    if (!current) return c.json({ error: 'unauthorized' }, 401)

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

    return c.json({
      places: mine.length,
      followers,
      following: followingCount,
      streakWeeks: streak,
      avgScore: mine.length ? mine.reduce((s, r) => s + r.score, 0) / mine.length : null,
      topCuisine: top(mine.map((r) => r.cuisine)),
      topNeighborhood: top(mine.map((r) => r.neighborhood)),
    })
  })
  // Avatar: the client resizes to a small JPEG and sends a data URL (Cloudinary
  // replaces this path at launch; the column already holds any URL). Size-capped.
  .patch('/avatar', async (c) => {
    const current = c.get('user')
    if (!current) return c.json({ error: 'unauthorized' }, 401)
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
  .delete('/', async (c) => {
    const current = c.get('user')
    if (!current) return c.json({ error: 'unauthorized' }, 401)
    await db.delete(schema.user).where(eq(schema.user.id, current.id))
    return c.json({ ok: true })
  })
