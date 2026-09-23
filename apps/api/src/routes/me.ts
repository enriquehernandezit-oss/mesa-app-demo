import { db, hashPhone, normalizePhone, schema } from '@mesa/db'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'

import { auth } from '../auth'
import type { AuthedEnv } from '../context'
import { imageRefSchema } from '../lib/imageRef'
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
  // Mesa's own unique @username, NOT Instagram (see instagramHandle below) —
  // it's what /p/u/:handle and the leaderboard's eligibility filter key off.
  // Optional — membership doesn't require a social identity.
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.]{2,30}$/, 'handle must be 2–30 chars: a–z, 0–9, _ or .')
    .optional(),
  neighborhoodSlug: z.string().trim().min(1),
  bio: z.string().trim().max(160).optional(),
  // A real Instagram @ (M23) — display-only, no OAuth verification, not
  // unique (two members may list the same public account). The leading "@"
  // (if any) is stripped in the handler below, same as handle's own igUser
  // convention on the client.
  instagramHandle: z.string().trim().max(31).optional(),
  website: z.string().trim().max(200).optional(),
  favoriteCuisines: z.array(z.string().trim().min(1)).max(10).optional(),
  favoriteNeighborhoodSlugs: z.array(z.string().trim().min(1)).max(20).optional(),
  // z.literal(true).optional() — required and true on first-time onboarding
  // completion (App Store 1.2), OMITTED on every later edit (this endpoint
  // is reused for both; see the header comment above). Omitting it must
  // never reject the save or re-stamp eulaAcceptedAt — a routine bio edit
  // is not a fresh EULA acceptance. Fixed 2026-09 (M23): before this, the
  // field was required unconditionally, so every edit-profile save 400'd —
  // apps/mobile/src/app/(tabs)/profile.tsx's EditProfile never sent it,
  // because it only ever meant to touch the fields it shows.
  acceptEula: z.literal(true).optional(),
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

const phoneSchema = z.object({ phone: z.string().trim().min(1).max(32) })

// Unset -> the contacts find-friends feature is dark: PUT refuses rather than
// hashing with no secret (an empty/undefined HMAC key would be a real
// security bug, not a soft-disable), matching the codebase's
// GOOGLE_PLACES_API_KEY/EXPO_ACCESS_TOKEN convention for "founder hasn't set
// this up yet."
const PHONE_MATCH_SECRET = process.env.PHONE_MATCH_SECRET

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
        // Gates the in-app moderation queue. Flipped directly in the DB —
        // there is no way to grant it from the product, on purpose.
        isModerator: true,
        // Only ever reduced to a boolean below — the raw hash never leaves
        // this route.
        phoneHash: true,
        // Private (M23): this response is the member's OWN profile (GET
        // /me, never GET /u/:userId's public passport), so returning it
        // here is fine — just never add it to a public-facing read.
        birthday: true,
        instagramHandle: true,
        website: true,
        favoriteCuisines: true,
      },
      with: {
        neighborhood: { columns: { slug: true, name: true } },
        // Just enough to know whether they have ranked anything at all.
        rankings: { columns: { id: true }, limit: 1 },
      },
    })
    if (!row) return c.json({ error: 'not_found' }, 404)

    // A second, plain query rather than threading this through the
    // relational `with` above — one extra round trip for the one "who am
    // I" request, not a per-row cost anywhere.
    const favoriteNeighborhoods = await db
      .select({ slug: schema.neighborhoods.slug, name: schema.neighborhoods.name })
      .from(schema.userFavoriteNeighborhoods)
      .innerJoin(
        schema.neighborhoods,
        eq(schema.neighborhoods.id, schema.userFavoriteNeighborhoods.neighborhoodId),
      )
      .where(eq(schema.userFavoriteNeighborhoods.userId, current.id))

    const { rankings, eulaAcceptedAt, neighborhoodId, phoneHash, ...profile } = row
    // Handle (Instagram) is optional, so it's no longer part of the gate —
    // a neighborhood, an accepted EULA, and at least one ranking complete it.
    const onboardingComplete =
      Boolean(neighborhoodId) && Boolean(eulaAcceptedAt) && rankings.length > 0

    return c.json({
      profile: {
        ...profile,
        neighborhood: row.neighborhood,
        favoriteNeighborhoods,
        // Contacts find-friends opt-in state (M18) — never the hash itself.
        phoneMatchEnabled: Boolean(phoneHash),
      },
      onboardingComplete,
    })
  })
  // Completes the profile step of onboarding (name, @handle, neighborhood,
  // EULA) AND is reused by app/(tabs)/profile.tsx's EditProfile for every
  // later edit — acceptEula is the only field that behaves differently
  // between the two calls (see its schema comment above).
  .patch('/profile', async (c) => {
    const current = c.get('user')

    const parsed = profileSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
    }
    const {
      name,
      handle,
      neighborhoodSlug,
      bio,
      instagramHandle,
      website,
      favoriteCuisines,
      favoriteNeighborhoodSlugs,
      acceptEula,
    } = parsed.data

    const neighborhood = await db.query.neighborhoods.findFirst({
      where: eq(schema.neighborhoods.slug, neighborhoodSlug),
      columns: { id: true },
    })
    if (!neighborhood) return c.json({ error: 'unknown_neighborhood' }, 400)

    // Resolved up front, before any write — an unknown slug here should
    // fail the whole save the same clean way an unknown home neighborhood
    // does above, not partially apply everything else first.
    let favoriteNeighborhoodIds: string[] | undefined
    if (favoriteNeighborhoodSlugs) {
      const rows = await db.query.neighborhoods.findMany({
        where: inArray(schema.neighborhoods.slug, favoriteNeighborhoodSlugs),
        columns: { id: true, slug: true },
      })
      if (rows.length !== new Set(favoriteNeighborhoodSlugs).size) {
        return c.json({ error: 'unknown_neighborhood' }, 400)
      }
      favoriteNeighborhoodIds = rows.map((r) => r.id)
    }

    // Handle uniqueness is enforced by the DB unique constraint; catch the
    // collision and return a clean 409 instead of a 500. Handle is only written
    // when provided — an omitted handle leaves the column null (optional).
    // instagramHandle/website/favoriteCuisines are the same "only touch what
    // was actually sent" shape — unlike bio below (an original field this
    // endpoint always clears when omitted, a behavior this change leaves
    // alone), these three are new enough that a caller not yet sending them
    // should never silently wipe a value a different caller set.
    try {
      await db.transaction(async (tx) => {
        await tx
          .update(schema.user)
          .set({
            name,
            ...(handle ? { handle } : {}),
            neighborhoodId: neighborhood.id,
            bio: bio ?? null,
            ...(instagramHandle !== undefined
              ? { instagramHandle: instagramHandle.replace(/^@/, '') || null }
              : {}),
            ...(website !== undefined ? { website: website || null } : {}),
            ...(favoriteCuisines ? { favoriteCuisines } : {}),
            ...(acceptEula ? { eulaAcceptedAt: new Date() } : {}),
            updatedAt: new Date(),
          })
          .where(eq(schema.user.id, current.id))

        if (favoriteNeighborhoodIds) {
          await tx
            .delete(schema.userFavoriteNeighborhoods)
            .where(eq(schema.userFavoriteNeighborhoods.userId, current.id))
          if (favoriteNeighborhoodIds.length > 0) {
            await tx.insert(schema.userFavoriteNeighborhoods).values(
              favoriteNeighborhoodIds.map((neighborhoodId) => ({
                userId: current.id,
                neighborhoodId,
              })),
            )
          }
        }
      })
    } catch (err) {
      if (err instanceof Error && err.message.includes('user_handle_unique')) {
        return c.json({ error: 'handle_taken' }, 409)
      }
      throw err
    }

    return c.json({ ok: true })
  })
  // Birthday (M23) — deliberately its OWN endpoint, not a field on
  // /me/profile above: it's mandatory at signup but private ever after
  // (account settings only, never the public profile), so it has nothing to
  // do with the rest of that form and forcing every profile save to also
  // carry it would be the wrong coupling. `date` mode is 'string' (see
  // schema.ts), so this is a plain YYYY-MM-DD round trip, no Date object.
  .patch('/birthday', async (c) => {
    const current = c.get('user')
    const parsed = z
      .object({
        birthday: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'birthday must be YYYY-MM-DD')
          .refine((s) => {
            const d = new Date(`${s}T00:00:00Z`)
            const [y, m, day] = s.split('-').map(Number)
            // Rejects a syntactically-valid-but-impossible date (Feb 30) and
            // anything outside a plausible human lifespan — a light sanity
            // check, not a real age-verification gate.
            return (
              !Number.isNaN(d.getTime()) &&
              d.getUTCFullYear() === y &&
              d.getUTCMonth() + 1 === m &&
              d.getUTCDate() === day &&
              d.getTime() < Date.now() &&
              y >= 1900
            )
          }, 'birthday is not a valid date'),
      })
      .safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
    }

    await db
      .update(schema.user)
      .set({ birthday: parsed.data.birthday, updatedAt: new Date() })
      .where(eq(schema.user.id, current.id))

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
    // Want-to-try count — backs the Rankings header's third stat, which used
    // to show "prom." (your own average score, the least actionable of the
    // three numbers there) and now shows this instead.
    const saved = await db.$count(schema.savedPlaces, eq(schema.savedPlaces.userId, current.id))

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
      saved,
      streakWeeks: streak,
      rankInDr,
      avgScore: mine.length ? mine.reduce((s, r) => s + r.score, 0) / mine.length : null,
      topCuisine: top(mine.map((r) => r.cuisine)),
      topNeighborhood: top(mine.map((r) => r.neighborhood)),
    })
  })
  // Avatar: the client resizes to a small square JPEG, uploads it via
  // POST /uploads, and sends back the resulting R2 URL — same validation as
  // every other image field (lib/imageRef.ts), not a hand-rolled check.
  .patch('/avatar', async (c) => {
    const current = c.get('user')
    const parsed = z
      .object({ image: imageRefSchema })
      .safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_image' }, 400)
    await db
      .update(schema.user)
      .set({ image: parsed.data.image, updatedAt: new Date() })
      .where(eq(schema.user.id, current.id))
    return c.json({ ok: true })
  })

  // Opt in to contacts find-friends (M18): "let your contacts find you."
  // Stores only HMAC(PHONE_MATCH_SECRET, E.164) — see phone.ts's own header
  // for why this is a separate column from Better Auth's `phoneNumber`
  // sign-in identity, never the plaintext number itself.
  .put('/phone', async (c) => {
    if (!PHONE_MATCH_SECRET) return c.json({ error: 'not_available' }, 503)
    const current = c.get('user')
    const parsed = phoneSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

    const e164 = normalizePhone(parsed.data.phone)
    if (!e164) return c.json({ error: 'invalid_phone' }, 400)

    await db
      .update(schema.user)
      .set({ phoneHash: hashPhone(e164, PHONE_MATCH_SECRET), updatedAt: new Date() })
      .where(eq(schema.user.id, current.id))
    return c.json({ ok: true })
  })

  // Opt back out — a no-op if never opted in.
  .delete('/phone', async (c) => {
    const current = c.get('user')
    await db
      .update(schema.user)
      .set({ phoneHash: null, updatedAt: new Date() })
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
