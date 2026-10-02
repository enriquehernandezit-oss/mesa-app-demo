import { db, hashPhone, normalizePhone, schema, tasteMatch } from '@mesa/db'
import { aliasedTable, and, desc, eq, inArray, isNull, ne, notInArray, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'

import type { AuthedEnv } from '../context'
import { parseHandlePrefix } from '../lib/mentions'
import { notify } from '../lib/notify'
import { blockedByMe, blockedMe, canSeeContent, followingIds } from '../lib/visibility'
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
): Promise<{ id: string; locked: boolean } | null> {
  const targetId = c.req.query('userId') || me.id
  if (targetId === me.id) return { id: targetId, locked: false }

  const target = await db.query.user.findFirst({
    where: eq(schema.user.id, targetId),
    columns: { bannedAt: true, isPrivate: true },
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

  // A private account's followers and following are for its approved followers (F1): anyone
  // else gets `locked` and an empty list, while the counts on the profile stay visible.
  const locked = !(await canSeeContent(me.id, { id: targetId, isPrivate: target.isPrivate }))
  return { id: targetId, locked }
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
      columns: { bannedAt: true, isPrivate: true },
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

    // A private account (F1) doesn't get followed, it gets asked: the request waits in
    // follow_requests until its owner accepts (POST /requests/:userId/accept). Someone who
    // already follows it stays following; asking twice is one request.
    if (target.isPrivate) {
      const [already] = await db
        .select({ x: schema.follows.followerId })
        .from(schema.follows)
        .where(
          and(eq(schema.follows.followerId, current.id), eq(schema.follows.followingId, targetId)),
        )
        .limit(1)
      if (already) return c.json({ ok: true, status: 'following' })

      const asked = await db
        .insert(schema.followRequests)
        .values({ requesterId: current.id, targetId })
        .onConflictDoNothing()
        .returning({ requesterId: schema.followRequests.requesterId })
      if (asked.length > 0) {
        notify([
          {
            userId: targetId,
            kind: 'follow_request',
            dedupeKey: `follow_request:${current.id}`,
            actorId: current.id,
          },
        ])
      }
      return c.json({ ok: true, status: 'requested' })
    }

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
      notify([
        {
          userId: targetId,
          kind: 'follow',
          dedupeKey: `follow:${current.id}`,
          actorId: current.id,
        },
      ])
    }

    return c.json({ ok: true, status: 'following' })
  })

  // Unfollow — and, for a private account, withdraw a pending request (and the request's row in
  // its owner's notifications, so the bell doesn't count something that no longer exists).
  .delete('/follow/:userId', async (c) => {
    const current = c.get('user')
    const targetId = c.req.param('userId')

    await db
      .delete(schema.follows)
      .where(
        and(eq(schema.follows.followerId, current.id), eq(schema.follows.followingId, targetId)),
      )
    await db
      .delete(schema.followRequests)
      .where(
        and(
          eq(schema.followRequests.requesterId, current.id),
          eq(schema.followRequests.targetId, targetId),
        ),
      )
    await db
      .delete(schema.notifications)
      .where(
        and(
          eq(schema.notifications.userId, targetId),
          eq(schema.notifications.dedupeKey, `follow_request:${current.id}`),
        ),
      )

    return c.json({ ok: true })
  })

  // The follow requests waiting on ME (F1) — the list behind Activity's pinned "Follow
  // requests" row: who asked, when, and whether I already follow them back. Newest first; banned
  // and blocked askers are left out (a block also deletes the request, this is belt and braces).
  .get('/requests', async (c) => {
    const me = c.get('user')
    const back = alias(schema.follows, 'back')
    const rows = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        handle: schema.user.handle,
        image: schema.user.image,
        neighborhood: schema.neighborhoods.name,
        requestedAt: schema.followRequests.createdAt,
        isFollowing: sql<boolean>`${back.followerId} is not null`,
      })
      .from(schema.followRequests)
      .innerJoin(schema.user, eq(schema.user.id, schema.followRequests.requesterId))
      .leftJoin(schema.neighborhoods, eq(schema.neighborhoods.id, schema.user.neighborhoodId))
      .leftJoin(
        back,
        and(eq(back.followerId, me.id), eq(back.followingId, schema.followRequests.requesterId)),
      )
      .where(
        and(
          eq(schema.followRequests.targetId, me.id),
          isNull(schema.user.bannedAt),
          notInArray(schema.user.id, blockedByMe(me.id)),
          notInArray(schema.user.id, blockedMe(me.id)),
        ),
      )
      .orderBy(desc(schema.followRequests.createdAt))
      .limit(100)
    return c.json({
      requests: rows.map((r) => ({ ...r, requestedAt: r.requestedAt.toISOString() })),
      count: rows.length,
    })
  })

  // Accept: the asker becomes an approved follower (a `follows` row — from here on the whole
  // app treats them as following me) and is told. 404 when there is no such request, so a
  // stale tap can't approve someone who cancelled.
  .post('/requests/:userId/accept', async (c) => {
    const me = c.get('user')
    const requesterId = c.req.param('userId')
    const accepted = await db.transaction(async (tx) => {
      const removed = await tx
        .delete(schema.followRequests)
        .where(
          and(
            eq(schema.followRequests.requesterId, requesterId),
            eq(schema.followRequests.targetId, me.id),
          ),
        )
        .returning({ requesterId: schema.followRequests.requesterId })
      if (removed.length === 0) return false
      await tx
        .insert(schema.follows)
        .values({ followerId: requesterId, followingId: me.id })
        .onConflictDoNothing()
      await tx
        .delete(schema.notifications)
        .where(
          and(
            eq(schema.notifications.userId, me.id),
            eq(schema.notifications.dedupeKey, `follow_request:${requesterId}`),
          ),
        )
      return true
    })
    if (!accepted) return c.json({ error: 'not_found' }, 404)

    // Clear a previous "accepted" row first, so accepting the same person a second time (they
    // unfollowed and asked again) is news again rather than swallowed by the unique key.
    await db
      .delete(schema.notifications)
      .where(
        and(
          eq(schema.notifications.userId, requesterId),
          eq(schema.notifications.dedupeKey, `follow_accepted:${me.id}`),
        ),
      )
    notify([
      {
        userId: requesterId,
        kind: 'follow_accepted',
        dedupeKey: `follow_accepted:${me.id}`,
        actorId: me.id,
      },
    ])
    return c.json({ ok: true })
  })

  // Delete a request. Quiet on purpose: the asker is not told, and it is idempotent.
  .post('/requests/:userId/decline', async (c) => {
    const me = c.get('user')
    const requesterId = c.req.param('userId')
    await db
      .delete(schema.followRequests)
      .where(
        and(
          eq(schema.followRequests.requesterId, requesterId),
          eq(schema.followRequests.targetId, me.id),
        ),
      )
    await db
      .delete(schema.notifications)
      .where(
        and(
          eq(schema.notifications.userId, me.id),
          eq(schema.notifications.dedupeKey, `follow_request:${requesterId}`),
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

  // The @-autocomplete: members whose @handle starts with what was typed after the "@" — the people I
  // follow first, then everyone else, alphabetically. An empty prefix is just my own following list. Not me,
  // not banned, no block either way. Everyone with a handle can be found (name and @handle are public
  // even on a private account); whether a mention then REACHES them is the notification's own rule.
  .get('/mention-search', async (c) => {
    const me = c.get('user')
    const prefix = parseHandlePrefix(c.req.query('q'))
    if (prefix === null) return c.json({ users: [] })
    const users = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        handle: schema.user.handle,
        image: schema.user.image,
        following: sql<boolean>`${schema.user.id} in (select following_id from follows where follower_id = ${me.id})`,
      })
      .from(schema.user)
      .where(
        and(
          sql`${schema.user.handle} is not null`,
          prefix ? sql`starts_with(${schema.user.handle}, ${prefix})` : undefined,
          // With nothing typed yet, only the people I follow make sense to offer.
          prefix ? undefined : inArray(schema.user.id, followingIds(me.id)),
          ne(schema.user.id, me.id),
          isNull(schema.user.bannedAt),
          notInArray(schema.user.id, blockedByMe(me.id)),
          notInArray(schema.user.id, blockedMe(me.id)),
        ),
      )
      .orderBy(
        desc(
          sql`${schema.user.id} in (select following_id from follows where follower_id = ${me.id})`,
        ),
        schema.user.handle,
      )
      .limit(8)
    return c.json({ users })
  })

  // Who follows the target (me by default, or ?userId=). Feeds the tappable
  // "Seguidores" stat and M3's follower-invite picker.
  .get('/followers', async (c) => {
    const me = c.get('user')
    const graph = await resolveGraphTarget(c, me)
    if (!graph) return c.json({ error: 'not_found' }, 404)
    if (graph.locked) return c.json({ users: [], locked: true })
    const targetId = graph.id

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
    const graph = await resolveGraphTarget(c, me)
    if (!graph) return c.json({ error: 'not_found' }, 404)
    if (graph.locked) return c.json({ users: [], locked: true })
    const targetId = graph.id

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
