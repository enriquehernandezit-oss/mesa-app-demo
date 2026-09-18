import { db, schema } from '@mesa/db'
import { and, asc, eq, gte, inArray, isNull, lt, notInArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AuthedEnv } from '../context'
import { sendPush } from '../lib/push'
import { blockedByMe, blockedMe, followerIds, followingIds } from '../lib/visibility'
import { requireAuth } from '../middleware/session'

// Mesa-curated events in Explore (M21) — never member-created; see
// docs/EVENTS.md for how a new one gets added. This file is browse (tonight/
// weekend/upcoming), one event's detail, and RSVP — schema-level rules
// (never delete a row, soft-cancel instead) live in schema/events.ts.
const { events, eventRsvps, restaurants, neighborhoods, user } = schema

// Santo Domingo has no DST (fixed UTC-4) — same fixed-offset trick as
// lib/push.ts's dish-nudge sweep, kept independent rather than shared since
// the two live in different windows of "what counts as SD-local now" (an
// hour-of-day check there, a calendar-date window here).
const SD_UTC_OFFSET_HOURS = 4

// A Date whose UTC getters read as Santo Domingo wall-clock fields — NOT a
// real instant, just a convenient way to read local Y/M/D/day-of-week with
// no timezone library.
function sdLocalNow(): Date {
  return new Date(Date.now() - SD_UTC_OFFSET_HOURS * 3600_000)
}

// The real UTC instant of SD-local midnight, `addDays` after `sdLocal`'s own
// date. `sdLocal`'s UTC Y/M/D fields (from sdLocalNow above) ARE Santo
// Domingo's wall-clock Y/M/D, so Date.UTC(...) on them gives "midnight as if
// SD were UTC" — adding the offset back converts that to the real instant.
function sdMidnight(sdLocal: Date, addDays: number): Date {
  const ms = Date.UTC(
    sdLocal.getUTCFullYear(),
    sdLocal.getUTCMonth(),
    sdLocal.getUTCDate() + addDays,
  )
  return new Date(ms + SD_UTC_OFFSET_HOURS * 3600_000)
}

// The three Explore browse windows, each as [start, end) in real UTC
// instants — `end: null` means no upper bound (upcoming). `start` is always
// clamped to "now" so a Friday-afternoon query for "weekend" never includes
// Friday morning's already-passed events.
function eventsWindow(when: string): { start: Date; end: Date | null } {
  const now = new Date()
  const local = sdLocalNow()
  if (when === 'tonight') {
    return { start: now, end: sdMidnight(local, 1) }
  }
  if (when === 'weekend') {
    const dow = local.getUTCDay() // SD-local day of week, 0=Sun..6=Sat
    const daysSinceFriday = (dow - 5 + 7) % 7 // Fri=0, Sat=1, Sun=2, Mon=3..Thu=6
    const inWeekend = daysSinceFriday <= 2
    const fridayOffset = inWeekend ? -daysSinceFriday : (5 - dow + 7) % 7
    const start = sdMidnight(local, fridayOffset)
    const end = sdMidnight(local, fridayOffset + 3) // the following Monday
    return { start: now > start ? now : start, end }
  }
  return { start: now, end: null } // 'upcoming' (also the fallback for an unknown value)
}

const rsvpSchema = z.object({ status: z.enum(['going', 'interested']) })

const eventCols = {
  id: events.id,
  slug: events.slug,
  title: events.title,
  description: events.description,
  startsAt: events.startsAt,
  endsAt: events.endsAt,
  category: events.category,
  priceLabel: events.priceLabel,
  ticketUrl: events.ticketUrl,
  coverImageId: events.coverImageId,
  restaurant: {
    id: restaurants.id,
    name: restaurants.name,
    cuisine: restaurants.cuisine,
    priceTier: restaurants.priceTier,
    coverImageId: restaurants.coverImageId,
  },
}

// Shared shaping for every list of events this file returns (browse, one
// restaurant's rail): the base rows plus, in exactly two more queries
// regardless of how many events came back, each one's going-count and up to
// 3 friend faces going — never a per-event query (CLAUDE.md rule 3).
async function withFriendsGoing<T extends { id: string; myStatus: 'going' | 'interested' | null }>(
  me: { id: string },
  rows: T[],
): Promise<(Omit<T, 'myStatus'> & FriendsGoingFields)[]> {
  const ids = rows.map((r) => r.id)
  if (ids.length === 0) return []

  const [goingCounts, friendFaces] = await Promise.all([
    db
      .select({ eventId: eventRsvps.eventId, count: sql<number>`count(*)::int` })
      .from(eventRsvps)
      .where(and(inArray(eventRsvps.eventId, ids), eq(eventRsvps.status, 'going')))
      .groupBy(eventRsvps.eventId),
    db
      .select({
        eventId: eventRsvps.eventId,
        id: user.id,
        name: user.name,
        image: user.image,
      })
      .from(eventRsvps)
      .innerJoin(user, eq(user.id, eventRsvps.userId))
      .where(
        and(
          inArray(eventRsvps.eventId, ids),
          eq(eventRsvps.status, 'going'),
          inArray(eventRsvps.userId, followingIds(me.id)),
          isNull(user.bannedAt),
          notInArray(eventRsvps.userId, blockedByMe(me.id)),
          notInArray(eventRsvps.userId, blockedMe(me.id)),
        ),
      ),
  ])

  const countByEvent = new Map(goingCounts.map((g) => [g.eventId, g.count]))
  const facesByEvent = new Map<string, { id: string; name: string; image: string | null }[]>()
  for (const f of friendFaces) {
    const list = facesByEvent.get(f.eventId) ?? []
    if (list.length < 3) list.push({ id: f.id, name: f.name, image: f.image })
    facesByEvent.set(f.eventId, list)
  }

  return rows.map(({ myStatus, ...r }) => ({
    ...r,
    myRsvp: myStatus,
    goingCount: countByEvent.get(r.id) ?? 0,
    friendsGoing: facesByEvent.get(r.id) ?? [],
  }))
}
type FriendsGoingFields = {
  myRsvp: 'going' | 'interested' | null
  goingCount: number
  friendsGoing: { id: string; name: string; image: string | null }[]
}

export const eventsRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)

  // Explore's "Eventos" browse — tonight / weekend / upcoming, defaulting to
  // upcoming for an unrecognized or missing ?when=.
  .get('/', async (c) => {
    const me = c.get('user')
    const when = c.req.query('when') ?? 'upcoming'
    const { start, end } = eventsWindow(when)

    const rows = await db
      .select({
        ...eventCols,
        neighborhood: neighborhoods.name,
        myStatus: eventRsvps.status,
      })
      .from(events)
      .innerJoin(restaurants, eq(restaurants.id, events.restaurantId))
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .leftJoin(eventRsvps, and(eq(eventRsvps.eventId, events.id), eq(eventRsvps.userId, me.id)))
      .where(
        and(
          isNull(events.cancelledAt),
          gte(events.startsAt, start),
          end ? lt(events.startsAt, end) : undefined,
        ),
      )
      .orderBy(asc(events.startsAt))
      .limit(50)

    return c.json({ events: await withFriendsGoing(me, rows) })
  })

  // One restaurant's own upcoming events — the "Próximos eventos" rail on
  // r/[restaurantId].tsx. Small and unwindowed (just "not passed, not
  // cancelled"), so a place with a recurring weekly night always shows it.
  .get('/restaurant/:id', async (c) => {
    const me = c.get('user')
    const restaurantId = c.req.param('id')
    if (!z.string().uuid().safeParse(restaurantId).success) return c.json({ events: [] })

    const rows = await db
      .select({
        ...eventCols,
        neighborhood: neighborhoods.name,
        myStatus: eventRsvps.status,
      })
      .from(events)
      .innerJoin(restaurants, eq(restaurants.id, events.restaurantId))
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .leftJoin(eventRsvps, and(eq(eventRsvps.eventId, events.id), eq(eventRsvps.userId, me.id)))
      .where(
        and(
          eq(events.restaurantId, restaurantId),
          isNull(events.cancelledAt),
          gte(events.startsAt, new Date()),
        ),
      )
      .orderBy(asc(events.startsAt))
      .limit(6)

    return c.json({ events: await withFriendsGoing(me, rows) })
  })

  // One event's detail — app/eventos/[eventId].tsx.
  .get('/:id', async (c) => {
    const me = c.get('user')
    const id = c.req.param('id')
    if (!z.string().uuid().safeParse(id).success) return c.json({ error: 'not_found' }, 404)

    const [row] = await db
      .select({
        ...eventCols,
        neighborhood: neighborhoods.name,
        myStatus: eventRsvps.status,
      })
      .from(events)
      .innerJoin(restaurants, eq(restaurants.id, events.restaurantId))
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .leftJoin(eventRsvps, and(eq(eventRsvps.eventId, events.id), eq(eventRsvps.userId, me.id)))
      .where(and(eq(events.id, id), isNull(events.cancelledAt)))
      .limit(1)
    if (!row) return c.json({ error: 'not_found' }, 404)

    const [shaped] = await withFriendsGoing(me, [row])
    return c.json({ event: shaped })
  })

  // Set (or change) my RSVP. Idempotent: re-sending the same status is a
  // harmless overwrite. The push to followers who'd marked 'interested' only
  // fires on the write that FIRST turns my status into 'going' — a later
  // toggle away and back never re-notifies (mirrors rankings.ts's
  // isFirstRanking trigger), and push_log's own dedupe on the unparameterized
  // key backs that up server-side even if this check somehow raced.
  .put('/:id/rsvp', async (c) => {
    const me = c.get('user')
    const eventId = c.req.param('id')
    if (!z.string().uuid().safeParse(eventId).success) return c.json({ error: 'not_found' }, 404)
    const parsed = rsvpSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

    const found = await db.query.events.findFirst({
      where: and(eq(events.id, eventId), isNull(events.cancelledAt)),
      columns: { id: true, title: true },
    })
    if (!found) return c.json({ error: 'not_found' }, 404)

    const existing = await db.query.eventRsvps.findFirst({
      where: and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, me.id)),
      columns: { status: true },
    })
    const wasGoing = existing?.status === 'going'

    await db
      .insert(eventRsvps)
      .values({ eventId, userId: me.id, status: parsed.data.status })
      .onConflictDoUpdate({
        target: [eventRsvps.eventId, eventRsvps.userId],
        set: { status: parsed.data.status, updatedAt: new Date() },
      })

    if (parsed.data.status === 'going' && !wasGoing) {
      const interested = await db
        .select({ userId: eventRsvps.userId })
        .from(eventRsvps)
        .where(
          and(
            eq(eventRsvps.eventId, eventId),
            eq(eventRsvps.status, 'interested'),
            inArray(eventRsvps.userId, followerIds(me.id)),
          ),
        )
      sendPush(
        interested.map((i) => ({
          userId: i.userId,
          key: `event-going:${eventId}:${me.id}`,
          category: 'friends',
          title: 'Mesa',
          body: `${me.name || 'Alguien'} va a ${found.title}`,
          data: { type: 'event', eventId },
        })),
      )
    }

    return c.json({ ok: true })
  })

  // Clear my RSVP outright — not a third status, a bare row deletion, same
  // "no rows" default as saved_places' bookmark-off.
  .delete('/:id/rsvp', async (c) => {
    const me = c.get('user')
    const eventId = c.req.param('id')
    await db
      .delete(eventRsvps)
      .where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, me.id)))
    return c.json({ ok: true })
  })
