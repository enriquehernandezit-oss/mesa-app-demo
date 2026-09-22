import { db, schema } from '@mesa/db'
import { and, asc, desc, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Hono } from 'hono'
import { z } from 'zod'

import type { AuthedEnv } from '../context'
import { sendPush } from '../lib/push'
import { blockedByMe, blockedMe } from '../lib/visibility'
import { requireAuth } from '../middleware/session'

// Group dinners. A host arms a plan — one fixed spot, or 2–3 candidates the
// invitees vote on — and invites some of their followers. Invitees are always
// a subset of the host's followers (never mutuals, never "anyone"); the host
// is not an invite row, so RSVP/voting endpoints refuse them explicitly.

const { plans, planOptions, planInvites, restaurants, neighborhoods, user, follows } = schema

const uuid = z.string().uuid()
const MAX_DAYS_AHEAD = 90

const createSchema = z
  .object({
    restaurantIds: z.array(uuid).min(1).max(3),
    startsAt: z.string().datetime({ offset: true }),
    note: z.string().trim().max(140).optional(),
    inviteeIds: z.array(z.string().min(1)).min(1).max(50),
  })
  .refine((b) => new Set(b.restaurantIds).size === b.restaurantIds.length, {
    message: 'duplicate restaurantIds',
  })
  .refine((b) => new Set(b.inviteeIds).size === b.inviteeIds.length, {
    message: 'duplicate inviteeIds',
  })

const replySchema = z
  .object({
    reply: z.enum(['going', 'maybe', 'declined']).optional(),
    voteRestaurantId: uuid.optional(),
  })
  .refine((b) => b.reply !== undefined || b.voteRestaurantId !== undefined, {
    message: 'reply or voteRestaurantId required',
  })

const inviteSchema = z.object({ userIds: z.array(z.string().min(1)).min(1).max(50) })
const confirmSchema = z.object({ restaurantId: uuid })

// Which of `userIds` the host may actually invite: followers of the host,
// not banned, not blocked in either direction. One query, no loop — the same
// shape POST /follow's block check uses, generalized to a batch.
async function invitableIds(hostId: string, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  const rows = await db
    .select({ id: user.id })
    .from(follows)
    .innerJoin(user, eq(user.id, follows.followerId))
    .where(
      and(
        eq(follows.followingId, hostId),
        inArray(follows.followerId, userIds),
        isNull(user.bannedAt),
        notInArray(user.id, blockedByMe(hostId)),
        notInArray(user.id, blockedMe(hostId)),
      ),
    )
  return new Set(rows.map((r) => r.id))
}

// One query: the plan, its host, and (if I'm invited) my own reply/vote — with
// the host-block filter every social read applies. Returns null for a
// malformed id, a plan that doesn't exist, or a banned/blocked host — the
// same "not_found" a stranger gets either way. Callers separately check
// `isHost || isInvited` for the 403 case: someone can legitimately GET a
// plan they're not part of and be told "forbidden" rather than "not found",
// which is what tells a caller the id itself was valid.
async function loadPlanFor(planId: string, meId: string) {
  if (!uuid.safeParse(planId).success) return null

  const mine = alias(planInvites, 'mine')
  const [row] = await db
    .select({
      plan: plans,
      host: {
        id: user.id,
        name: user.name,
        handle: user.handle,
        image: user.image,
        bannedAt: user.bannedAt,
      },
      myReply: mine.reply,
      myVote: mine.voteRestaurantId,
    })
    .from(plans)
    .innerJoin(user, eq(user.id, plans.hostId))
    .leftJoin(mine, and(eq(mine.planId, plans.id), eq(mine.userId, meId)))
    .where(
      and(
        eq(plans.id, planId),
        notInArray(plans.hostId, blockedByMe(meId)),
        notInArray(plans.hostId, blockedMe(meId)),
      ),
    )
    .limit(1)
  if (!row || row.host.bannedAt) return null

  const isHost = row.plan.hostId === meId
  const isInvited = row.myReply !== null
  return {
    plan: row.plan,
    host: row.host,
    myReply: row.myReply,
    myVote: row.myVote,
    isHost,
    isInvited,
  }
}

export const plansRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)

  // Arm a plan. One spot = confirmed immediately (nothing to vote on); 2–3 =
  // open for a vote. Invitees must already be followers of the host — this
  // is the one write that turns a batch of user ids into real invite rows,
  // so it's also where an invalid batch is rejected outright rather than
  // silently trimmed (POST /:id/invite, adding people later, is lenient
  // instead — see its own comment).
  .post('/', async (c) => {
    const me = c.get('user')
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)
    const { restaurantIds, note, inviteeIds } = parsed.data

    const startsAt = new Date(parsed.data.startsAt)
    const now = Date.now()
    const maxAheadMs = MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000
    if (
      Number.isNaN(startsAt.getTime()) ||
      startsAt.getTime() <= now ||
      startsAt.getTime() - now > maxAheadMs
    ) {
      return c.json({ error: 'invalid_date' }, 400)
    }

    const validRestaurants = await db
      .select({ id: restaurants.id })
      .from(restaurants)
      .where(
        and(
          inArray(restaurants.id, restaurantIds),
          isNull(restaurants.removedAt),
          isNull(restaurants.closedAt),
        ),
      )
    if (validRestaurants.length !== restaurantIds.length) {
      return c.json({ error: 'unknown_restaurant' }, 400)
    }

    if (inviteeIds.includes(me.id)) return c.json({ error: 'cannot_invite_self' }, 400)
    const invitable = await invitableIds(me.id, inviteeIds)
    if (invitable.size !== inviteeIds.length) return c.json({ error: 'invalid_invitees' }, 400)

    const fixed = restaurantIds.length === 1

    const id = await db.transaction(async (tx) => {
      const [plan] = await tx
        .insert(plans)
        .values({
          hostId: me.id,
          note: note || null,
          startsAt,
          status: fixed ? 'confirmed' : 'open',
          chosenRestaurantId: fixed ? restaurantIds[0] : null,
        })
        .returning({ id: plans.id })
      // Unreachable in practice — a successful single-row insert always
      // returns its row — but narrows the type instead of asserting past it.
      if (!plan) throw new Error('plan insert returned no row')
      await tx.insert(planOptions).values(
        restaurantIds.map((restaurantId, position) => ({
          planId: plan.id,
          restaurantId,
          position,
        })),
      )
      await tx.insert(planInvites).values(inviteeIds.map((userId) => ({ planId: plan.id, userId })))
      return plan.id
    })

    sendPush(
      inviteeIds.map((userId) => ({
        userId,
        key: `plan-invite:${id}:${userId}`,
        category: 'plans',
        title: 'Mesa',
        body: `${me.name || 'Alguien'} te invitó a un plan`,
        data: { type: 'plan', planId: id },
      })),
    )

    return c.json({ id })
  })

  // Every plan I host or am invited to — 2 fixed queries, no N+1. Sectioning
  // (pending / upcoming / past) is a client concern; this just returns
  // everything relevant, newest-starting first.
  .get('/', async (c) => {
    const me = c.get('user')
    const mine = alias(planInvites, 'mine')

    const rows = await db
      .select({
        id: plans.id,
        status: plans.status,
        startsAt: plans.startsAt,
        note: plans.note,
        chosenRestaurantId: plans.chosenRestaurantId,
        host: { id: user.id, name: user.name, handle: user.handle, image: user.image },
        isHost: sql<boolean>`${plans.hostId} = ${me.id}`,
        myReply: mine.reply,
        myVote: mine.voteRestaurantId,
        going: sql<number>`count(*) filter (where ${planInvites.reply} = 'going')::int`,
        maybe: sql<number>`count(*) filter (where ${planInvites.reply} = 'maybe')::int`,
        pending: sql<number>`count(*) filter (where ${planInvites.reply} = 'pending')::int`,
      })
      .from(plans)
      .innerJoin(user, eq(user.id, plans.hostId))
      .leftJoin(mine, and(eq(mine.planId, plans.id), eq(mine.userId, me.id)))
      .leftJoin(planInvites, eq(planInvites.planId, plans.id))
      .where(
        and(
          or(eq(plans.hostId, me.id), sql`${mine.userId} is not null`),
          notInArray(plans.hostId, blockedByMe(me.id)),
          notInArray(plans.hostId, blockedMe(me.id)),
        ),
      )
      .groupBy(plans.id, user.id, mine.reply, mine.voteRestaurantId)
      .orderBy(desc(plans.startsAt))
      .limit(100)

    const planIds = rows.map((r) => r.id)
    const optionsByPlan = new Map<
      string,
      {
        id: string
        name: string
        coverImageId: string | null
        neighborhood: string | null
        cuisine: string | null
        priceTier: number | null
        position: number
      }[]
    >()
    if (planIds.length > 0) {
      const optRows = await db
        .select({
          planId: planOptions.planId,
          id: restaurants.id,
          name: restaurants.name,
          coverImageId: restaurants.coverImageId,
          neighborhood: neighborhoods.name,
          cuisine: restaurants.cuisine,
          priceTier: restaurants.priceTier,
          position: planOptions.position,
        })
        .from(planOptions)
        .innerJoin(restaurants, eq(restaurants.id, planOptions.restaurantId))
        .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
        .where(inArray(planOptions.planId, planIds))
        .orderBy(asc(planOptions.position))
      for (const o of optRows) {
        const list = optionsByPlan.get(o.planId) ?? []
        list.push({
          id: o.id,
          name: o.name,
          coverImageId: o.coverImageId,
          neighborhood: o.neighborhood,
          cuisine: o.cuisine,
          priceTier: o.priceTier,
          position: o.position,
        })
        optionsByPlan.set(o.planId, list)
      }
    }

    return c.json({
      plans: rows.map((r) => ({
        id: r.id,
        status: r.status,
        startsAt: r.startsAt.toISOString(),
        note: r.note,
        chosenRestaurantId: r.chosenRestaurantId,
        host: r.host,
        isHost: r.isHost,
        myReply: r.myReply,
        myVote: r.myVote,
        options: optionsByPlan.get(r.id) ?? [],
        counts: { going: r.going, maybe: r.maybe, pending: r.pending },
      })),
    })
  })

  // One plan's full detail: options with live vote counts, and every member
  // with their reply/vote — 3 queries total (loadPlanFor, options, members).
  .get('/:id', async (c) => {
    const me = c.get('user')
    const planId = c.req.param('id')
    const found = await loadPlanFor(planId, me.id)
    if (!found) return c.json({ error: 'not_found' }, 404)
    if (!found.isHost && !found.isInvited) return c.json({ error: 'forbidden' }, 403)

    const options = await db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        coverImageId: restaurants.coverImageId,
        neighborhood: neighborhoods.name,
        cuisine: restaurants.cuisine,
        priceTier: restaurants.priceTier,
        position: planOptions.position,
        votes: sql<number>`count(${planInvites.userId})::int`,
      })
      .from(planOptions)
      .innerJoin(restaurants, eq(restaurants.id, planOptions.restaurantId))
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .leftJoin(
        planInvites,
        and(
          eq(planInvites.planId, planOptions.planId),
          eq(planInvites.voteRestaurantId, planOptions.restaurantId),
        ),
      )
      .where(eq(planOptions.planId, planId))
      .groupBy(restaurants.id, neighborhoods.name, planOptions.position)
      .orderBy(asc(planOptions.position))

    const memberRows = await db
      .select({
        id: user.id,
        name: user.name,
        handle: user.handle,
        image: user.image,
        reply: planInvites.reply,
        voteRestaurantId: planInvites.voteRestaurantId,
        repliedAt: planInvites.repliedAt,
      })
      .from(planInvites)
      .innerJoin(user, eq(user.id, planInvites.userId))
      .where(
        and(
          eq(planInvites.planId, planId),
          isNull(user.bannedAt),
          notInArray(user.id, blockedByMe(me.id)),
          notInArray(user.id, blockedMe(me.id)),
        ),
      )
      .orderBy(asc(planInvites.createdAt))

    // found.host carries bannedAt for loadPlanFor's own 404 check — internal,
    // never meant to reach the client.
    const { bannedAt: _bannedAt, ...host } = found.host

    return c.json({
      id: found.plan.id,
      status: found.plan.status,
      startsAt: found.plan.startsAt.toISOString(),
      note: found.plan.note,
      chosenRestaurantId: found.plan.chosenRestaurantId,
      host,
      isHost: found.isHost,
      myReply: found.myReply,
      myVote: found.myVote,
      options,
      members: memberRows.map((m) => ({
        ...m,
        repliedAt: m.repliedAt ? m.repliedAt.toISOString() : null,
      })),
    })
  })

  // RSVP and/or vote. The host never has an invite row, so they can't reply —
  // that 403 is deliberate, not an oversight (see plans.ts's own comment).
  .post('/:id/reply', async (c) => {
    const me = c.get('user')
    const planId = c.req.param('id')
    const parsed = replySchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

    const found = await loadPlanFor(planId, me.id)
    if (!found) return c.json({ error: 'not_found' }, 404)
    if (!found.isInvited) return c.json({ error: 'forbidden' }, 403)
    if (found.plan.status === 'cancelled') return c.json({ error: 'plan_cancelled' }, 409)
    if (found.plan.startsAt.getTime() < Date.now()) return c.json({ error: 'plan_past' }, 409)

    const { reply, voteRestaurantId } = parsed.data
    if (voteRestaurantId !== undefined) {
      if (found.plan.status !== 'open') return c.json({ error: 'voting_closed' }, 409)
      const option = await db.query.planOptions.findFirst({
        where: and(eq(planOptions.planId, planId), eq(planOptions.restaurantId, voteRestaurantId)),
        columns: { planId: true },
      })
      if (!option) return c.json({ error: 'invalid_vote' }, 400)
    }

    await db
      .update(planInvites)
      .set({
        ...(reply !== undefined ? { reply } : {}),
        ...(voteRestaurantId !== undefined ? { voteRestaurantId } : {}),
        repliedAt: new Date(),
      })
      .where(and(eq(planInvites.planId, planId), eq(planInvites.userId, me.id)))

    // The host is never an invite row, so this always has a real recipient.
    // One push per call, describing whichever changed — reply wins when both
    // did, since "declined" is the more important thing for the host to see
    // than the vote that came with it.
    const name = me.name || 'Alguien'
    const replyBody =
      reply === 'going'
        ? `${name} va a tu plan`
        : reply === 'maybe'
          ? `${name} tal vez va a tu plan`
          : reply === 'declined'
            ? `${name} no puede ir a tu plan`
            : null
    const body = replyBody ?? `${name} votó en tu plan`
    // Keyed on the resulting state, not the request time — a genuine change
    // (going -> declined) is a new key and re-notifies the host; an accidental
    // duplicate submit of the same reply/vote dedupes for free.
    sendPush([
      {
        userId: found.plan.hostId,
        key: `plan-reply:${planId}:${me.id}:${reply ?? ''}:${voteRestaurantId ?? ''}`,
        category: 'plans',
        title: 'Mesa',
        body,
        data: { type: 'plan', planId },
      },
    ])

    return c.json({ ok: true })
  })

  // Invite more followers to an already-armed plan. Lenient on purpose, unlike
  // POST /: this is "add whoever's still eligible" (someone may have
  // unfollowed since the plan was created), not a batch that either fully
  // succeeds or fails.
  .post('/:id/invite', async (c) => {
    const me = c.get('user')
    const planId = c.req.param('id')
    const parsed = inviteSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

    const found = await loadPlanFor(planId, me.id)
    if (!found) return c.json({ error: 'not_found' }, 404)
    if (!found.isHost) return c.json({ error: 'forbidden' }, 403)
    if (found.plan.status === 'cancelled') return c.json({ error: 'plan_cancelled' }, 409)

    const invitable = await invitableIds(me.id, parsed.data.userIds)
    if (invitable.size === 0) return c.json({ error: 'invalid_invitees' }, 400)

    const added = await db
      .insert(planInvites)
      .values([...invitable].map((userId) => ({ planId, userId })))
      .onConflictDoNothing()
      .returning({ userId: planInvites.userId })

    return c.json({ added: added.length })
  })

  // Settle the vote (or just close out a plan nobody's voting on). Once
  // confirmed, a plan can still be cancelled but never re-opened.
  .post('/:id/confirm', async (c) => {
    const me = c.get('user')
    const planId = c.req.param('id')
    const parsed = confirmSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

    const found = await loadPlanFor(planId, me.id)
    if (!found) return c.json({ error: 'not_found' }, 404)
    if (!found.isHost) return c.json({ error: 'forbidden' }, 403)
    if (found.plan.status !== 'open') return c.json({ error: 'not_open' }, 409)

    const option = await db.query.planOptions.findFirst({
      where: and(
        eq(planOptions.planId, planId),
        eq(planOptions.restaurantId, parsed.data.restaurantId),
      ),
      columns: { planId: true },
    })
    if (!option) return c.json({ error: 'invalid_option' }, 400)

    await db
      .update(plans)
      .set({
        status: 'confirmed',
        chosenRestaurantId: parsed.data.restaurantId,
        updatedAt: new Date(),
      })
      .where(eq(plans.id, planId))

    return c.json({ ok: true })
  })

  // Idempotent — cancelling an already-cancelled plan is a no-op, not an error.
  .post('/:id/cancel', async (c) => {
    const me = c.get('user')
    const planId = c.req.param('id')

    const found = await loadPlanFor(planId, me.id)
    if (!found) return c.json({ error: 'not_found' }, 404)
    if (!found.isHost) return c.json({ error: 'forbidden' }, 403)

    await db
      .update(plans)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(plans.id, planId))

    return c.json({ ok: true })
  })
