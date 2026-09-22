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
// weekend/upcoming), one event's detail, RSVP, and Save (the bookmark,
// independent of RSVP; see GET /saved) — schema-level rules
// (never delete a row, soft-cancel instead) live on `events` in schema.ts.
const { events, eventRsvps, savedEvents, restaurants, neighborhoods, user } = schema

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
// instants over startsAt — `start: null` / `end: null` mean no bound. `start`
// is the window's first SD-local midnight (today for tonight, Friday for
// weekend), NOT clamped to now: "still on" is notEnded's job below, so an
// event that started at noon and runs till 4pm still shows at 1pm, while
// tonight/weekend still never reach back into an earlier day.
function eventsWindow(when: string): { start: Date | null; end: Date | null } {
  const sdLocal = sdLocalNow()
  if (when === 'tonight') {
    return { start: sdMidnight(sdLocal, 0), end: sdMidnight(sdLocal, 1) }
  }
  if (when === 'weekend') {
    const dow = sdLocal.getUTCDay() // SD-local day of week, 0=Sun..6=Sat
    const daysSinceFriday = (dow - 5 + 7) % 7 // Fri=0, Sat=1, Sun=2, Mon=3..Thu=6
    const inWeekend = daysSinceFriday <= 2
    const fridayOffset = inWeekend ? -daysSinceFriday : (5 - dow + 7) % 7
    return {
      start: sdMidnight(sdLocal, fridayOffset),
      end: sdMidnight(sdLocal, fridayOffset + 3), // the following Monday
    }
  }
  return { start: null, end: null } // 'upcoming' (also the fallback for an unknown value)
}

// "Not over yet" — the one definition of ended every list here shares, and
// the client's countdown rule: over once endsAt has passed or, with no
// endsAt, 3h after startsAt (an event with no end time is treated as 3h long).
const notEnded = sql`coalesce(${events.endsAt}, ${events.startsAt} + interval '3 hours') > now()`

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
  capacity: events.capacity,
  bookingWhatsapp: events.bookingWhatsapp,
  // Has the venue actually agreed to this event? Every shape carries it so
  // the client can show "evento de muestra" until it's true.
  venueConfirmed: events.venueConfirmed,
  restaurant: {
    id: restaurants.id,
    name: restaurants.name,
    cuisine: restaurants.cuisine,
    priceTier: restaurants.priceTier,
    coverImageId: restaurants.coverImageId,
  },
}

// My Save bookmark on an event — independent of the RSVP. Every query that
// selects it joins savedEvents scoped to me (a leftJoin on browse/detail, an
// innerJoin on /saved), so it rides in the same round trip, never a lookup.
const savedByMe = sql<boolean>`${savedEvents.userId} is not null`

// Shared shaping for every event this file returns (browse, one restaurant's
// rail, detail): the base rows plus, in exactly two more queries regardless
// of how many events came back, each one's going-count and up to 3 friend
// faces going — never a per-event query (CLAUDE.md rule 3). spotsLeft is
// derived here from that same going-count, never stored.
async function withFriendsGoing<
  T extends { id: string; capacity: number | null; myStatus: 'going' | 'interested' | null },
>(me: { id: string }, rows: T[]): Promise<(Omit<T, 'myStatus'> & FriendsGoingFields)[]> {
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

  return rows.map(({ myStatus, ...r }) => {
    const goingCount = countByEvent.get(r.id) ?? 0
    return {
      ...r,
      myRsvp: myStatus,
      goingCount,
      spotsLeft: r.capacity === null ? null : Math.max(0, r.capacity - goingCount),
      friendsGoing: facesByEvent.get(r.id) ?? [],
    }
  })
}
type FriendsGoingFields = {
  myRsvp: 'going' | 'interested' | null
  goingCount: number
  spotsLeft: number | null
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
        savedByMe,
      })
      .from(events)
      .innerJoin(restaurants, eq(restaurants.id, events.restaurantId))
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .leftJoin(eventRsvps, and(eq(eventRsvps.eventId, events.id), eq(eventRsvps.userId, me.id)))
      .leftJoin(savedEvents, and(eq(savedEvents.eventId, events.id), eq(savedEvents.userId, me.id)))
      .where(
        and(
          isNull(events.cancelledAt),
          notEnded,
          start ? gte(events.startsAt, start) : undefined,
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
        savedByMe,
      })
      .from(events)
      .innerJoin(restaurants, eq(restaurants.id, events.restaurantId))
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .leftJoin(eventRsvps, and(eq(eventRsvps.eventId, events.id), eq(eventRsvps.userId, me.id)))
      .leftJoin(savedEvents, and(eq(savedEvents.eventId, events.id), eq(savedEvents.userId, me.id)))
      .where(and(eq(events.restaurantId, restaurantId), isNull(events.cancelledAt), notEnded))
      .orderBy(asc(events.startsAt))
      .limit(6)

    return c.json({ events: await withFriendsGoing(me, rows) })
  })

  // My saved events — the general Saved area (events are never addable to a
  // custom collection). Only what's still ahead or happening: cancelled
  // events drop out, and so does anything already over (notEnded above).
  // Registered before /:id so "saved" is never read as an event id.
  .get('/saved', async (c) => {
    const me = c.get('user')

    const rows = await db
      .select({
        ...eventCols,
        neighborhood: neighborhoods.name,
        myStatus: eventRsvps.status,
        savedByMe,
      })
      .from(savedEvents)
      .innerJoin(events, eq(events.id, savedEvents.eventId))
      .innerJoin(restaurants, eq(restaurants.id, events.restaurantId))
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .leftJoin(eventRsvps, and(eq(eventRsvps.eventId, events.id), eq(eventRsvps.userId, me.id)))
      .where(and(eq(savedEvents.userId, me.id), isNull(events.cancelledAt), notEnded))
      .orderBy(asc(events.startsAt))

    return c.json({ events: await withFriendsGoing(me, rows) })
  })

  // One event's detail — app/events/[eventId].tsx.
  .get('/:id', async (c) => {
    const me = c.get('user')
    const id = c.req.param('id')
    if (!z.string().uuid().safeParse(id).success) return c.json({ error: 'not_found' }, 404)

    const [row] = await db
      .select({
        ...eventCols,
        neighborhood: neighborhoods.name,
        myStatus: eventRsvps.status,
        savedByMe,
      })
      .from(events)
      .innerJoin(restaurants, eq(restaurants.id, events.restaurantId))
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .leftJoin(eventRsvps, and(eq(eventRsvps.eventId, events.id), eq(eventRsvps.userId, me.id)))
      .leftJoin(savedEvents, and(eq(savedEvents.eventId, events.id), eq(savedEvents.userId, me.id)))
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

  // Save an event (the bookmark) — independent of RSVP. Idempotent: saving
  // an already-saved event is a no-op. Only a live (not cancelled) event can
  // be saved.
  .put('/:id/save', async (c) => {
    const me = c.get('user')
    const eventId = c.req.param('id')
    if (!z.string().uuid().safeParse(eventId).success) return c.json({ error: 'not_found' }, 404)

    const found = await db.query.events.findFirst({
      where: and(eq(events.id, eventId), isNull(events.cancelledAt)),
      columns: { id: true },
    })
    if (!found) return c.json({ error: 'not_found' }, 404)

    await db.insert(savedEvents).values({ eventId, userId: me.id }).onConflictDoNothing()
    return c.json({ saved: true })
  })

  // Unsave — a bare row deletion, idempotent (no row is already "unsaved").
  .delete('/:id/save', async (c) => {
    const me = c.get('user')
    const eventId = c.req.param('id')
    if (!z.string().uuid().safeParse(eventId).success) return c.json({ error: 'not_found' }, 404)

    await db
      .delete(savedEvents)
      .where(and(eq(savedEvents.eventId, eventId), eq(savedEvents.userId, me.id)))
    return c.json({ saved: false })
  })
