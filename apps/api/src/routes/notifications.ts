import { db, schema } from '@mesa/db'
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notExists,
  notInArray,
  or,
  sql,
} from 'drizzle-orm'
import { type PgColumn, alias } from 'drizzle-orm/pg-core'
import { Hono } from 'hono'
import { z } from 'zod'

import type { AuthedEnv } from '../context'
import { blockedByMe, blockedMe } from '../lib/visibility'
import { requireAuth } from '../middleware/session'

// Push token registration, the category switches on app/notifications.tsx (M17), and the
// inbox behind the bell (N1). See `notificationPrefs` in packages/db/src/schema.ts for why a
// missing prefs row means "everything on," and the `notifications` table's own header for
// what an inbox row is.

const { pushTokens, notificationPrefs, notifications, user, restaurants, events, dishes } = schema
const { rankingComments, follows } = schema

// NOTE: duplicated by hand in apps/mobile/src/lib/types.ts (that app can't import this —
// see that file's own note on why). Keep the two in sync.
export interface NotificationItem {
  id: string
  kind: schema.NotificationKind
  createdAt: string
  read: boolean
  actor: { id: string; name: string; handle: string | null; image: string | null } | null
  restaurant: { id: string; name: string; coverImageId: string | null } | null
  rankingId: string | null
  planId: string | null
  dishListId: string | null
  dish: { id: string; name: string } | null
  event: { id: string; title: string; startsAt: string } | null
  data: schema.NotificationData | null
  // follow rows: do I already follow them back?
  followsBack: boolean
  // event_going rows: how many OTHER people I follow are going to the same event.
  others: number
}

const INBOX_PAGE = 30

// The actor is someone the viewer may still see: not banned, no block either way. A block
// made AFTER a notification was written hides it here — the write-time filter in
// lib/notify.ts only stops new ones.
const actorVisible = (meId: string, u: { id: PgColumn; bannedAt: PgColumn }) =>
  and(isNull(u.bannedAt), notInArray(u.id, blockedByMe(meId)), notInArray(u.id, blockedMe(meId)))

// Which inbox rows show, shared by the page and the badge so they can never disagree. The
// caller joins `user` (the actor), `dishes` (live ones only) and `rankingComments`.
//   · a row's actor is still visible to me;
//   · a dish that was removed, or a comment moderation removed, takes its row with it;
//   · event_going collapses to ONE row per event — the newest — because a popular event
//     would otherwise fill the whole inbox with a row per friend (the count of the others
//     rides on that row: "Ana and 42 others are going").
function visibleRow(meId: string) {
  const other = alias(notifications, 'n2')
  const otherActor = alias(user, 'u2')
  const newerGoing = db
    .select({ one: sql`1` })
    .from(other)
    .innerJoin(otherActor, eq(otherActor.id, other.actorId))
    .where(
      and(
        eq(other.userId, notifications.userId),
        eq(other.kind, 'event_going'),
        eq(other.eventId, notifications.eventId),
        sql`(${other.createdAt}, ${other.id}) > (${notifications.createdAt}, ${notifications.id})`,
        actorVisible(meId, otherActor),
      ),
    )
  return and(
    or(isNull(notifications.actorId), actorVisible(meId, user)),
    or(isNull(notifications.dishId), isNotNull(dishes.id)),
    or(isNull(notifications.commentId), isNull(rankingComments.removedAt)),
    or(ne(notifications.kind, 'event_going'), notExists(newerGoing)),
  )
}

// `before` is the previous page's `nextBefore`: the last row's createdAt and id, so rows
// sharing a millisecond can't be skipped between pages.
const cursorId = z.string().uuid()
function parseCursor(raw: string | undefined): { at: Date; id: string } | null | 'invalid' {
  if (!raw) return null
  const [ts, id] = raw.split('_')
  const at = new Date(ts ?? '')
  if (Number.isNaN(at.getTime()) || !cursorId.safeParse(id).success) return 'invalid'
  return { at, id: id as string }
}

const tokenSchema = z.object({ token: z.string().trim().min(1).max(512) })
const prefsSchema = z
  .object({
    social: z.boolean().optional(),
    plans: z.boolean().optional(),
    friends: z.boolean().optional(),
    dishes: z.boolean().optional(),
    events: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'at least one field required' })

const readSchema = z.object({ before: z.string().datetime().optional() })

const DEFAULT_PREFS = { social: true, plans: true, friends: true, dishes: true, events: true }

export const notificationsRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)

  // Register (or re-register) this device's Expo push token. A token
  // handed off to another account (device sold, app reinstalled under a
  // different sign-in) just moves — onConflictDoUpdate reassigns userId
  // rather than erroring, since `token` is the PK and there's exactly one
  // legitimate owner of a given device's token at a time.
  .post('/token', async (c) => {
    const me = c.get('user')
    const parsed = tokenSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

    await db
      .insert(pushTokens)
      .values({ token: parsed.data.token, userId: me.id })
      .onConflictDoUpdate({
        target: pushTokens.token,
        set: { userId: me.id },
      })
    return c.json({ ok: true })
  })

  // Sign-out and account deletion both call this — a device that's signed
  // out shouldn't keep receiving another session's pushes.
  .delete('/token', async (c) => {
    const me = c.get('user')
    const parsed = tokenSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

    await db
      .delete(pushTokens)
      .where(and(eq(pushTokens.token, parsed.data.token), eq(pushTokens.userId, me.id)))
    return c.json({ ok: true })
  })

  .get('/prefs', async (c) => {
    const me = c.get('user')
    const row = await db.query.notificationPrefs.findFirst({
      where: eq(notificationPrefs.userId, me.id),
      columns: { social: true, plans: true, friends: true, dishes: true, events: true },
    })
    return c.json(row ?? DEFAULT_PREFS)
  })

  .patch('/prefs', async (c) => {
    const me = c.get('user')
    const parsed = prefsSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

    const [row] = await db
      .insert(notificationPrefs)
      .values({ userId: me.id, ...DEFAULT_PREFS, ...parsed.data })
      .onConflictDoUpdate({
        target: notificationPrefs.userId,
        set: { ...parsed.data, updatedAt: new Date() },
      })
      .returning({
        social: notificationPrefs.social,
        plans: notificationPrefs.plans,
        friends: notificationPrefs.friends,
        dishes: notificationPrefs.dishes,
        events: notificationPrefs.events,
      })
    return c.json(row ?? DEFAULT_PREFS)
  })

  // The bell's list, newest first, 30 at a time. One joined query for the page plus one
  // grouped count for the event_going rows on it — a fixed number of queries however many
  // rows there are.
  .get('/inbox', async (c) => {
    const me = c.get('user')
    const cursor = parseCursor(c.req.query('before'))
    if (cursor === 'invalid') return c.json({ error: 'invalid_cursor' }, 400)

    const back = alias(follows, 'back')
    const rows = await db
      .select({
        id: notifications.id,
        kind: notifications.kind,
        createdAt: notifications.createdAt,
        readAt: notifications.readAt,
        rankingId: notifications.rankingId,
        planId: notifications.planId,
        dishListId: notifications.dishListId,
        data: notifications.data,
        actorId: notifications.actorId,
        actorName: user.name,
        actorHandle: user.handle,
        actorImage: user.image,
        restaurantId: restaurants.id,
        restaurantName: restaurants.name,
        restaurantCover: restaurants.coverImageId,
        eventId: events.id,
        eventTitle: events.title,
        eventStartsAt: events.startsAt,
        dishId: dishes.id,
        dishName: dishes.name,
        followsBack: sql<boolean>`${back.followerId} is not null`,
      })
      .from(notifications)
      .leftJoin(user, eq(user.id, notifications.actorId))
      .leftJoin(restaurants, eq(restaurants.id, notifications.restaurantId))
      .leftJoin(events, eq(events.id, notifications.eventId))
      .leftJoin(dishes, and(eq(dishes.id, notifications.dishId), isNull(dishes.removedAt)))
      .leftJoin(rankingComments, eq(rankingComments.id, notifications.commentId))
      .leftJoin(back, and(eq(back.followerId, me.id), eq(back.followingId, notifications.actorId)))
      .where(
        and(
          eq(notifications.userId, me.id),
          visibleRow(me.id),
          cursor
            ? or(
                lt(notifications.createdAt, cursor.at),
                and(eq(notifications.createdAt, cursor.at), lt(notifications.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(INBOX_PAGE + 1)

    const page = rows.slice(0, INBOX_PAGE)
    const goingEventIds = [
      ...new Set(page.flatMap((r) => (r.kind === 'event_going' && r.eventId ? [r.eventId] : []))),
    ]
    const goingCounts = new Map<string, number>()
    if (goingEventIds.length > 0) {
      const counts = await db
        .select({ eventId: notifications.eventId, n: sql<number>`count(*)::int` })
        .from(notifications)
        .innerJoin(user, eq(user.id, notifications.actorId))
        .where(
          and(
            eq(notifications.userId, me.id),
            eq(notifications.kind, 'event_going'),
            inArray(notifications.eventId, goingEventIds),
            actorVisible(me.id, user),
          ),
        )
        .groupBy(notifications.eventId)
      for (const row of counts) if (row.eventId) goingCounts.set(row.eventId, row.n)
    }

    const items: NotificationItem[] = page.map((r) => ({
      id: r.id,
      kind: r.kind,
      createdAt: r.createdAt.toISOString(),
      read: r.readAt !== null,
      actor:
        r.actorId && r.actorName !== null
          ? { id: r.actorId, name: r.actorName, handle: r.actorHandle, image: r.actorImage }
          : null,
      restaurant:
        r.restaurantId && r.restaurantName !== null
          ? { id: r.restaurantId, name: r.restaurantName, coverImageId: r.restaurantCover }
          : null,
      rankingId: r.rankingId,
      planId: r.planId,
      dishListId: r.dishListId,
      dish: r.dishId && r.dishName !== null ? { id: r.dishId, name: r.dishName } : null,
      event:
        r.eventId && r.eventTitle !== null && r.eventStartsAt
          ? { id: r.eventId, title: r.eventTitle, startsAt: r.eventStartsAt.toISOString() }
          : null,
      data: r.data,
      followsBack: r.followsBack,
      others: r.eventId ? Math.max((goingCounts.get(r.eventId) ?? 1) - 1, 0) : 0,
    }))
    const last = page[page.length - 1]
    return c.json({
      notifications: items,
      nextBefore:
        rows.length > INBOX_PAGE && last ? `${last.createdAt.toISOString()}_${last.id}` : null,
    })
  })

  // The bell's badge: how many of the rows the inbox would show are still unread.
  .get('/unread', async (c) => {
    const me = c.get('user')
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .leftJoin(user, eq(user.id, notifications.actorId))
      .leftJoin(dishes, and(eq(dishes.id, notifications.dishId), isNull(dishes.removedAt)))
      .leftJoin(rankingComments, eq(rankingComments.id, notifications.commentId))
      .where(and(eq(notifications.userId, me.id), isNull(notifications.readAt), visibleRow(me.id)))
    return c.json({ count: row?.count ?? 0 })
  })

  // Mark read everything up to `before` (the newest createdAt the screen showed) — or,
  // without it, everything up to now. Rows that arrive while the inbox is open stay unread.
  .post('/read', async (c) => {
    const me = c.get('user')
    const parsed = readSchema.safeParse((await c.req.json().catch(() => null)) ?? {})
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.userId, me.id),
          isNull(notifications.readAt),
          lte(
            notifications.createdAt,
            parsed.data.before ? new Date(parsed.data.before) : new Date(),
          ),
        ),
      )
    return c.json({ ok: true })
  })
