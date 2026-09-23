import { db, hashPhone, normalizePhone, schema, tasteMatch } from '@mesa/db'
import { aliasedTable, and, desc, eq, inArray, isNull, ne, notInArray, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'

import type { AuthedEnv } from '../context'
import { sendPush } from '../lib/push'
import { blockedByMe, blockedMe, followingIds } from '../lib/visibility'
import { requireAuth } from '../middleware/session'

// The social graph write side. Follow/unfollow is used first during onboarding
// friend-find; the discovery feed that reads this graph lands in M4.

const followSchema = z.object({ userId: z.string().min(1) })

// A real contact list can run into the hundreds; capped well above that so
// the request body can't be used to hammer the DB, not to reject anyone's
// actual address book.
const contactsMatchSchema = z.object({
  phones: z.array(z.string().trim().min(1).max(32)).min(1).max(2000),
})

// A followers/following export file can run into the low thousands for an
// active Instagram account.
const instagramMatchSchema = z.object({
  handles: z.array(z.string().trim().min(1).max(60)).min(1).max(5000),
})

// Unset -> the contacts feature is fully dark, same convention as PUT /me/phone.
const PHONE_MATCH_SECRET = process.env.PHONE_MATCH_SECRET

// Shared by GET /followers and GET /following: resolve which user's graph is
// being read (me, or ?userId=someone-else) and refuse — with the same
// "not_found" a banned or nonexistent user gets, never a distinguishing error
// — if that person is banned or a block exists in either direction.
async function resolveGraphTarget(
  c: Context<AuthedEnv>,
  me: { id: string },
): Promise<string | null> {
  const targetId = c.req.query('userId') || me.id
  if (targetId === me.id) return targetId

  const target = await db.query.user.findFirst({
    where: eq(schema.user.id, targetId),
    columns: { bannedAt: true },
  })
  if (!target || target.bannedAt) return null

  const blocked = await db.query.userBlocks.findFirst({
    where: or(
      and(eq(schema.userBlocks.blockerId, me.id), eq(schema.userBlocks.blockedId, targetId)),
      and(eq(schema.userBlocks.blockerId, targetId), eq(schema.userBlocks.blockedId, me.id)),
    ),
    columns: { blockerId: true },
  })
  if (blocked) return null

  return targetId
}

export const socialRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)

  .post('/follow', async (c) => {
    const current = c.get('user')

    const parsed = followSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)
    const targetId = parsed.data.userId
    if (targetId === current.id) {
      return c.json({ error: 'cannot_follow_self' }, 400)
    }

    // A block deletes any existing follow edge (see /moderation/blocks), but
    // nothing previously stopped re-following a blocker (or someone you'd
    // blocked) right back through this endpoint. Same "not_found" a banned
    // or nonexistent target gets — this never confirms to the caller whether
    // a block exists, just that following isn't possible.
    const target = await db.query.user.findFirst({
      where: eq(schema.user.id, targetId),
      columns: { bannedAt: true },
    })
    if (!target || target.bannedAt) return c.json({ error: 'not_found' }, 404)

    const blocked = await db.query.userBlocks.findFirst({
      where: or(
        and(eq(schema.userBlocks.blockerId, current.id), eq(schema.userBlocks.blockedId, targetId)),
        and(eq(schema.userBlocks.blockerId, targetId), eq(schema.userBlocks.blockedId, current.id)),
      ),
      columns: { blockerId: true },
    })
    if (blocked) return c.json({ error: 'not_found' }, 404)

    // Idempotent: following someone you already follow is a no-op, not an
    // error — and `.returning()` is how the push trigger tells "new follow"
    // from "already following", so a repeat tap of a Follow button never
    // re-notifies.
    const inserted = await db
      .insert(schema.follows)
      .values({ followerId: current.id, followingId: targetId })
      .onConflictDoNothing()
      .returning({ followerId: schema.follows.followerId })

    if (inserted.length > 0) {
      sendPush([
        {
          userId: targetId,
          key: `follow:${current.id}:${targetId}`,
          category: 'social',
          title: 'Mesa',
          body: `${current.name || 'Alguien'} te empezó a seguir`,
          data: { type: 'user', userId: current.id },
        },
      ])
    }

    return c.json({ ok: true })
  })

  .delete('/follow/:userId', async (c) => {
    const current = c.get('user')

    await db
      .delete(schema.follows)
      .where(
        and(
          eq(schema.follows.followerId, current.id),
          eq(schema.follows.followingId, c.req.param('userId')),
        ),
      )

    return c.json({ ok: true })
  })

  // Contacts find-friends (M18): given a batch of raw numbers from the
  // member's own device address book, tell them which ones belong to a
  // Mesa account. Nothing here is stored — every submitted number is
  // normalized + hashed in-request and discarded once the response is
  // built. The response is keyed by the SUBMITTED phone string (not the
  // normalized E.164) so the client can look the contact's name back up in
  // its own local address book without this route ever seeing it.
  .post('/contacts/match', async (c) => {
    if (!PHONE_MATCH_SECRET) return c.json({ matches: [] })
    const me = c.get('user')
    const parsed = contactsMatchSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

    const hashToPhone = new Map<string, string>()
    for (const raw of parsed.data.phones) {
      const e164 = normalizePhone(raw)
      if (!e164) continue
      const hash = hashPhone(e164, PHONE_MATCH_SECRET)
      if (!hashToPhone.has(hash)) hashToPhone.set(hash, raw)
    }
    if (hashToPhone.size === 0) return c.json({ matches: [] })

    const rows = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        handle: schema.user.handle,
        image: schema.user.image,
        phoneHash: schema.user.phoneHash,
      })
      .from(schema.user)
      .where(
        and(
          inArray(schema.user.phoneHash, [...hashToPhone.keys()]),
          ne(schema.user.id, me.id),
          isNull(schema.user.bannedAt),
          notInArray(schema.user.id, blockedByMe(me.id)),
          notInArray(schema.user.id, blockedMe(me.id)),
        ),
      )

    const matches = rows.flatMap((r) => {
      const phone = r.phoneHash ? hashToPhone.get(r.phoneHash) : undefined
      if (!phone) return []
      return [{ phone, id: r.id, name: r.name, handle: r.handle, image: r.image }]
    })
    return c.json({ matches })
  })

  // Instagram find-friends (M18): given the @handles from a member's own
  // "Descarga tu información" export (parsed entirely on-device — see
  // lib/instagramImport.ts), find which ones are Mesa members. Matches
  // Mesa's OWN @handle column, not a separate table — `user.handle` already
  // doubles as a member's Instagram handle when they connected that
  // provider (CLAUDE.md's own note), and is otherwise just their chosen
  // display handle. Stores nothing: the submitted list is never persisted,
  // only diffed against existing rows. Unverified by construction (an
  // Instagram export can't prove Mesa's handle is even the same person), so
  // the client must always present this as a suggestion, never an
  // auto-follow.
  .post('/instagram/match', async (c) => {
    const me = c.get('user')
    const parsed = instagramMatchSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

    const handles = [
      ...new Set(
        parsed.data.handles.map((h) => h.trim().toLowerCase().replace(/^@/, '')).filter(Boolean),
      ),
    ]
    if (handles.length === 0) return c.json({ matches: [] })

    const matches = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        handle: schema.user.handle,
        image: schema.user.image,
      })
      .from(schema.user)
      .where(
        and(
          inArray(schema.user.handle, handles),
          ne(schema.user.id, me.id),
          isNull(schema.user.bannedAt),
          notInArray(schema.user.id, blockedByMe(me.id)),
          notInArray(schema.user.id, blockedMe(me.id)),
        ),
      )
      .limit(200)

    return c.json({ matches })
  })

  // Resolve a public @handle to a user id. Shared profile links address people by
  // handle (`/p/u/@ana`), but every in-app profile route is keyed by id — so the
  // app hits this once when a shared link opens, then navigates to /u/<id>.
  // Exact match only: this is link resolution, not search (that lives in the
  // explore endpoint and is deliberately fuzzy).
  .get('/by-handle/:handle', async (c) => {
    const handle = c.req.param('handle').replace(/^@/, '').toLowerCase()
    if (!handle) return c.json({ error: 'not_found' }, 404)

    const target = await db.query.user.findFirst({
      where: eq(schema.user.handle, handle),
      columns: { id: true, bannedAt: true },
    })
    // A banned account's link resolves to nothing rather than a dead profile.
    if (!target || target.bannedAt) return c.json({ error: 'not_found' }, 404)

    return c.json({ userId: target.id })
  })

  // Who follows the target (me by default, or ?userId=). Feeds the tappable
  // "Seguidores" stat and M3's follower-invite picker.
  .get('/followers', async (c) => {
    const me = c.get('user')
    const targetId = await resolveGraphTarget(c, me)
    if (!targetId) return c.json({ error: 'not_found' }, 404)

    // `back` answers "do I (the caller) already follow this row's user" —
    // the same join shape as activity.ts's new-followers section, just keyed
    // off whatever list is being read instead of always my own.
    const back = alias(schema.follows, 'back')
    const users = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        handle: schema.user.handle,
        image: schema.user.image,
        neighborhood: schema.neighborhoods.name,
        isFollowing: sql<boolean>`${back.followerId} is not null`,
      })
      .from(schema.follows)
      .innerJoin(schema.user, eq(schema.user.id, schema.follows.followerId))
      .leftJoin(schema.neighborhoods, eq(schema.neighborhoods.id, schema.user.neighborhoodId))
      .leftJoin(
        back,
        and(eq(back.followerId, me.id), eq(back.followingId, schema.follows.followerId)),
      )
      .where(
        and(
          eq(schema.follows.followingId, targetId),
          isNull(schema.user.bannedAt),
          notInArray(schema.user.id, blockedByMe(me.id)),
          notInArray(schema.user.id, blockedMe(me.id)),
        ),
      )
      .orderBy(desc(schema.follows.createdAt))
      .limit(200)

    return c.json({ users })
  })

  // Find-friends suggestions (M18, rescored M9) — richer than /onboarding/
  // suggested-friends (which stays as-is for onboarding and the empty feed):
  // every row here carries a `reason` the client renders as the subtitle.
  // Three fixed queries, each already excluding me/who I follow/dismissed/
  // banned/blocked — but unlike the old version, they're not disjoint
  // LIMITed tiers concatenated and deduped; each pulls a wide-ish candidate
  // POOL, and a candidate who shows up in more than one gets every signal it
  // qualified for. One real ranking falls out of that: mutual-follower count
  // first (Instagram's actual signal — friends-of-friends overlap), taste
  // match as a tie-break, then whether they have any followers at all as the
  // last tail fallback. `reason` on the response is just whichever of those
  // three is the *strongest* one this candidate has, so the copy is
  // unchanged from before — only the ranking underneath it is real now.
  .get('/suggestions', async (c) => {
    const me = c.get('user')
    const myFollows = followingIds(me.id)
    const dismissed = db
      .select({ id: schema.friendSuggestionDismissals.dismissedUserId })
      .from(schema.friendSuggestionDismissals)
      .where(eq(schema.friendSuggestionDismissals.userId, me.id))
    const notBanned = isNull(schema.user.bannedAt)
    const notBlocked = [
      notInArray(schema.user.id, blockedByMe(me.id)),
      notInArray(schema.user.id, blockedMe(me.id)),
    ]
    // Wider than the old per-tier 8/8/10 LIMITs on purpose: a candidate with
    // a so-so mutual count but a great taste match (or vice versa) has to
    // appear in BOTH pools for their combined score to reflect that. Still
    // bounded — not a full-table scan — since each is its own ORDER BY LIMIT.
    const POOL = 30

    // Mutuals: people followed by people I follow.
    const mutualRows = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        handle: schema.user.handle,
        image: schema.user.image,
        neighborhood: schema.neighborhoods.name,
        mutualCount: sql<number>`count(distinct ${schema.follows.followerId})::int`,
      })
      .from(schema.follows)
      .innerJoin(schema.user, eq(schema.user.id, schema.follows.followingId))
      .leftJoin(schema.neighborhoods, eq(schema.neighborhoods.id, schema.user.neighborhoodId))
      .where(
        and(
          inArray(schema.follows.followerId, myFollows),
          ne(schema.follows.followingId, me.id),
          notInArray(schema.follows.followingId, myFollows),
          notInArray(schema.follows.followingId, dismissed),
          notBanned,
          ...notBlocked,
        ),
      )
      .groupBy(schema.user.id, schema.neighborhoods.name)
      .orderBy(sql`count(distinct ${schema.follows.followerId}) desc`)
      .limit(POOL)

    // One sample mutual-friend name per candidate above, for "Lo sigue(n) X
    // (y N más)" — a single extra query over the whole pool at once, not one
    // per candidate.
    const mutualIds = mutualRows.map((r) => r.id)
    const sampleMutualFriend = new Map<string, string>()
    if (mutualIds.length > 0) {
      const samples = await db
        .select({
          candidateId: schema.follows.followingId,
          name: schema.user.name,
          handle: schema.user.handle,
        })
        .from(schema.follows)
        .innerJoin(schema.user, eq(schema.user.id, schema.follows.followerId))
        .where(
          and(
            inArray(schema.follows.followingId, mutualIds),
            inArray(schema.follows.followerId, myFollows),
          ),
        )
      for (const s of samples) {
        if (!sampleMutualFriend.has(s.candidateId)) {
          sampleMutualFriend.set(s.candidateId, s.name || s.handle || '')
        }
      }
    }

    // Similar taste: the M16 helper's own threshold (≥3 shared places),
    // ordered by average score gap so the closest matches come first — the
    // exact percentage is computed per-row below via tasteMatch(), reusing
    // rankings.ts's own formula rather than a second copy of it.
    const mine = aliasedTable(schema.rankings, 'mine')
    const tasteRows = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        handle: schema.user.handle,
        image: schema.user.image,
        neighborhood: schema.neighborhoods.name,
        shared: sql<number>`count(*)::int`,
        avgGap: sql<number>`avg(abs(${mine.score} - ${schema.rankings.score}))::float`,
      })
      .from(mine)
      .innerJoin(schema.rankings, eq(schema.rankings.restaurantId, mine.restaurantId))
      .innerJoin(schema.user, eq(schema.user.id, schema.rankings.userId))
      .leftJoin(schema.neighborhoods, eq(schema.neighborhoods.id, schema.user.neighborhoodId))
      .where(
        and(
          eq(mine.userId, me.id),
          ne(schema.rankings.userId, me.id),
          notInArray(schema.rankings.userId, myFollows),
          notInArray(schema.rankings.userId, dismissed),
          notBanned,
          ...notBlocked,
        ),
      )
      .groupBy(schema.user.id, schema.neighborhoods.name)
      .having(sql`count(*) >= 3`)
      .orderBy(sql`avg(abs(${mine.score} - ${schema.rankings.score})) asc`)
      .limit(POOL)

    // Popular: the tail fallback once mutuals and taste run out. No longer
    // requires a handle (M9) — mutual/taste never did either, and a null
    // handle doesn't stop `name` from rendering, so the filter was just an
    // inconsistency, not a real eligibility rule.
    const popularRows = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        handle: schema.user.handle,
        image: schema.user.image,
        neighborhood: schema.neighborhoods.name,
        followerCount: sql<number>`count(${schema.follows.followerId})::int`,
      })
      .from(schema.user)
      .leftJoin(schema.neighborhoods, eq(schema.neighborhoods.id, schema.user.neighborhoodId))
      .leftJoin(schema.follows, eq(schema.follows.followingId, schema.user.id))
      .where(
        and(
          ne(schema.user.id, me.id),
          notInArray(schema.user.id, myFollows),
          notInArray(schema.user.id, dismissed),
          notBanned,
          ...notBlocked,
        ),
      )
      .groupBy(schema.user.id, schema.neighborhoods.name)
      .orderBy(sql`count(${schema.follows.followerId}) desc`)
      .limit(POOL)

    type Candidate = {
      id: string
      name: string
      handle: string | null
      image: string | null
      neighborhood: string | null
      mutualCount: number
      mutualFriendName: string | null
      tasteScore: number | null
      followerCount: number
    }
    const byId = new Map<string, Candidate>()
    function candidate(r: {
      id: string
      name: string
      handle: string | null
      image: string | null
      neighborhood: string | null
    }): Candidate {
      const existing = byId.get(r.id)
      if (existing) return existing
      const fresh: Candidate = {
        id: r.id,
        name: r.name,
        handle: r.handle,
        image: r.image,
        neighborhood: r.neighborhood,
        mutualCount: 0,
        mutualFriendName: null,
        tasteScore: null,
        followerCount: 0,
      }
      byId.set(r.id, fresh)
      return fresh
    }

    for (const r of mutualRows) {
      const name = sampleMutualFriend.get(r.id)
      if (!name) continue // no follow row survived the block filter above
      const cand = candidate(r)
      cand.mutualCount = r.mutualCount
      cand.mutualFriendName = name
    }
    for (const r of tasteRows) {
      const percent = tasteMatch(r.avgGap, r.shared)
      if (percent == null) continue
      candidate(r).tasteScore = percent
    }
    for (const r of popularRows) {
      candidate(r).followerCount = r.followerCount
    }

    const suggestions = [...byId.values()]
      .sort(
        (a, b) =>
          b.mutualCount - a.mutualCount ||
          (b.tasteScore ?? -1) - (a.tasteScore ?? -1) ||
          b.followerCount - a.followerCount,
      )
      .slice(0, 20)
      .map((cand) => ({
        id: cand.id,
        name: cand.name,
        handle: cand.handle,
        image: cand.image,
        neighborhood: cand.neighborhood,
        reason:
          cand.mutualCount > 0
            ? {
                kind: 'mutual' as const,
                name: cand.mutualFriendName as string,
                extraCount: Math.max(0, cand.mutualCount - 1),
              }
            : cand.tasteScore != null
              ? { kind: 'taste' as const, percent: cand.tasteScore }
              : { kind: 'popular' as const },
      }))

    return c.json({ users: suggestions })
  })

  // "Not interested" (M9) — the one thing the old three-tier version had no
  // way to express: a rejected suggestion returned forever. Permanent, no
  // undo surfaced anywhere. Idempotent, same onConflictDoNothing shape as
  // POST /follow.
  .post('/suggestions/:userId/dismiss', async (c) => {
    const me = c.get('user')
    const dismissedUserId = c.req.param('userId')
    if (dismissedUserId === me.id) return c.json({ error: 'invalid_target' }, 400)

    const target = await db.query.user.findFirst({
      where: eq(schema.user.id, dismissedUserId),
      columns: { id: true },
    })
    if (!target) return c.json({ error: 'not_found' }, 404)

    await db
      .insert(schema.friendSuggestionDismissals)
      .values({ userId: me.id, dismissedUserId })
      .onConflictDoNothing()

    return c.json({ ok: true })
  })

  // Who the target follows (me by default, or ?userId=). The mirror of
  // /followers — same block/ban filtering, same shape.
  .get('/following', async (c) => {
    const me = c.get('user')
    const targetId = await resolveGraphTarget(c, me)
    if (!targetId) return c.json({ error: 'not_found' }, 404)

    const back = alias(schema.follows, 'back')
    const users = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        handle: schema.user.handle,
        image: schema.user.image,
        neighborhood: schema.neighborhoods.name,
        isFollowing: sql<boolean>`${back.followerId} is not null`,
      })
      .from(schema.follows)
      .innerJoin(schema.user, eq(schema.user.id, schema.follows.followingId))
      .leftJoin(schema.neighborhoods, eq(schema.neighborhoods.id, schema.user.neighborhoodId))
      .leftJoin(
        back,
        and(eq(back.followerId, me.id), eq(back.followingId, schema.follows.followingId)),
      )
      .where(
        and(
          eq(schema.follows.followerId, targetId),
          isNull(schema.user.bannedAt),
          notInArray(schema.user.id, blockedByMe(me.id)),
          notInArray(schema.user.id, blockedMe(me.id)),
        ),
      )
      .orderBy(desc(schema.follows.createdAt))
      .limit(200)

    return c.json({ users })
  })
