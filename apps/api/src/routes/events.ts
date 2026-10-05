import { db, schema } from '@mesa/db'
import { and, asc, desc, eq, gte, inArray, isNull, lt, notInArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'

import type { AuthedEnv } from '../context'
import { isUpcoming } from '../lib/eventPush'
import { notify } from '../lib/notify'
import { sdLocalNow, sdMidnight, tonightLateWindow } from '../lib/sdTime'
import { blockedByMe, blockedMe, followerIds, followingIds } from '../lib/visibility'
import { requireAuth } from '../middleware/session'

// Mesa-curated events in Explore (M21) — never member-created; see
// docs/EVENTS.md for how a new one gets added. This file is browse (tonight/
// weekend/upcoming), one event's detail, RSVP, and Save (the bookmark,
// independent of RSVP; see GET /saved) — schema-level rules
// (never delete a row, soft-cancel instead) live on `events` in schema.ts.
const { events, eventRsvps, savedEvents, restaurants, neighborhoods, user } = schema

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
// of how many events came back, each one's going-count, how many of the people
// I follow are going, and up to 3 of their faces — never a per-event query
// (CLAUDE.md rule 3). The friend count is the true one (the faces are only the
// first 3, for the avatar stack); "32 friends going" is worth saying. spotsLeft
// is derived here from that same going-count, never stored.
async function withFriendsGoing<
  T extends {
    id: string
    capacity: number | null
    myStatus: 'going' | 'interested' | null
    restaurant: object
    neighborhood: string | null
  },
>(me: { id: string }, rows: T[]) {
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
  const friendCountByEvent = new Map<string, number>()
  for (const f of friendFaces) {
    friendCountByEvent.set(f.eventId, (friendCountByEvent.get(f.eventId) ?? 0) + 1)
    const list = facesByEvent.get(f.eventId) ?? []
    if (list.length < 3) list.push({ id: f.id, name: f.name, image: f.image })
    facesByEvent.set(f.eventId, list)
  }

  return rows.map(({ myStatus, ...r }) => {
    const goingCount = countByEvent.get(r.id) ?? 0
    return {
      ...r,
      // The app reads it under `restaurant` (types.ts EventSummary); the queries select it beside
      // it, so it was always blank on the event page and the hero. Both are sent, so an app that
      // already reads the top-level one keeps working.
      restaurant: { ...r.restaurant, neighborhood: r.neighborhood },
      myRsvp: myStatus,
      goingCount,
      spotsLeft: r.capacity === null ? null : Math.max(0, r.capacity - goingCount),
      friendsGoing: facesByEvent.get(r.id) ?? [],
      friendsGoingCount: friendCountByEvent.get(r.id) ?? 0,
    }
  })
}

// The people I follow who are going to an event, most recent sign-up first — the list
// behind "32 friends going". Same visibility as the count and the faces (withFriendsGoing):
// banned accounts and anyone blocked either way are left out. Capped, because a list
// nobody scrolls past a couple of hundred isn't worth its bytes.
const GOING_LIST_MAX = 200
async function friendsGoingList(me: { id: string }, eventId: string) {
  return db
    .select({ id: user.id, name: user.name, handle: user.handle, image: user.image })
    .from(eventRsvps)
    .innerJoin(user, eq(user.id, eventRsvps.userId))
    .where(
      and(
        eq(eventRsvps.eventId, eventId),
        eq(eventRsvps.status, 'going'),
        inArray(eventRsvps.userId, followingIds(me.id)),
        isNull(user.bannedAt),
        notInArray(eventRsvps.userId, blockedByMe(me.id)),
        notInArray(eventRsvps.userId, blockedMe(me.id)),
      ),
    )
    .orderBy(desc(eventRsvps.updatedAt), asc(user.id))
    .limit(GOING_LIST_MAX)
}

// Everyone who follows this member and could be told they signed up: not banned, and no
// block either way. Exported for the DB test — the route calls it once per first "going".
export async function eventGoingRecipients(me: { id: string }): Promise<string[]> {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        inArray(user.id, followerIds(me.id)),
        isNull(user.bannedAt),
        notInArray(user.id, blockedByMe(me.id)),
        notInArray(user.id, blockedMe(me.id)),
      ),
    )
  return rows.map((r) => r.id)
}

// The events that haven't ended and start inside [start, end) (either bound may be
// null), soonest first, shaped for the client — the browse list, and the Feed's
// "Tonight" card (GET /home) both read through this.
async function browseEvents(
  me: { id: string },
  { start, end }: { start: Date | null; end: Date | null },
  limit: number,
) {
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
    .limit(limit)
  return withFriendsGoing(me, rows)
}

// Everything on tonight (now → 4 AM Santo Domingo — lib/sdTime.ts), for GET /home.
// A pool, not the final five: lib/home.ts's selectTonight orders and trims it.
export const tonightEvents = (me: { id: string }) => browseEvents(me, tonightLateWindow(), 30)

export const eventsRoutes = new Hono<AuthedEnv>()
  .use(requireAuth)

  // Explore's "Eventos" browse — tonight / weekend / upcoming, defaulting to
  // upcoming for an unrecognized or missing ?when=.
  .get('/', async (c) => {
    const me = c.get('user')
    const when = c.req.query('when') ?? 'upcoming'
    return c.json({ events: await browseEvents(me, eventsWindow(when), 50) })
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

  // My "going" RSVPs — what I've actually committed to, ascending by start
  // time. 'interested' doesn't appear here: it isn't a commitment, and
  // event reminders (lib/push.ts's sweepEventReminders) only fire for
  // 'going' too. Registered before /:id, same reason /saved is.
  .get('/mine', async (c) => {
    const me = c.get('user')

    const rows = await db
      .select({
        ...eventCols,
        neighborhood: neighborhoods.name,
        myStatus: eventRsvps.status,
        savedByMe,
      })
      .from(eventRsvps)
      .innerJoin(events, eq(events.id, eventRsvps.eventId))
      .innerJoin(restaurants, eq(restaurants.id, events.restaurantId))
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .leftJoin(savedEvents, and(eq(savedEvents.eventId, events.id), eq(savedEvents.userId, me.id)))
      .where(
        and(
          eq(eventRsvps.userId, me.id),
          eq(eventRsvps.status, 'going'),
          isNull(events.cancelledAt),
          notEnded,
        ),
      )
      .orderBy(asc(events.startsAt))

    return c.json({ events: await withFriendsGoing(me, rows) })
  })

  // One event's detail — app/events/[eventId].tsx. Unlike every other read
  // here, a cancelled event is NOT filtered out at the WHERE clause: it's
  // filtered per-row below, so a member holding an RSVP can still open the
  // event a cancellation push sent them to (docs/EVENTS.md's "stays
  // reachable by anyone who already RSVP'd" — the WHERE-clause version of
  // this endpoint silently broke that promise). Everyone else still gets a
  // plain 404, same as before.
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
        cancelledAt: events.cancelledAt,
      })
      .from(events)
      .innerJoin(restaurants, eq(restaurants.id, events.restaurantId))
      .leftJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
      .leftJoin(eventRsvps, and(eq(eventRsvps.eventId, events.id), eq(eventRsvps.userId, me.id)))
      .leftJoin(savedEvents, and(eq(savedEvents.eventId, events.id), eq(savedEvents.userId, me.id)))
      .where(eq(events.id, id))
      .limit(1)
    if (!row || (row.cancelledAt && !row.myStatus)) return c.json({ error: 'not_found' }, 404)

    const { cancelledAt, ...rest } = row
    const [shaped] = await withFriendsGoing(me, [rest])
    return c.json({ event: { ...shaped, cancelled: cancelledAt !== null } })
  })

  // Who, of the people I follow, is going — the list behind "32 friends going".
  .get('/:id/going', async (c) => {
    const me = c.get('user')
    const eventId = c.req.param('id')
    if (!z.string().uuid().safeParse(eventId).success) return c.json({ error: 'not_found' }, 404)
    const found = await db.query.events.findFirst({
      where: eq(events.id, eventId),
      columns: { id: true },
    })
    if (!found) return c.json({ error: 'not_found' }, 404)
    return c.json({ friends: await friendsGoingList(me, eventId) })
  })

  // Set (or change) my RSVP. Idempotent: re-sending the same status is a
  // harmless overwrite. When I FIRST say 'going' to an event that hasn't ended,
  // everyone who follows me gets it in their inbox (one push per follower per event per
  // few hours — lib/eventPush.ts — however many friends sign up); a later toggle away and
  // back never re-notifies, because the inbox row is unique per (follower, me, event).
  .put('/:id/rsvp', async (c) => {
    const me = c.get('user')
    const eventId = c.req.param('id')
    if (!z.string().uuid().safeParse(eventId).success) return c.json({ error: 'not_found' }, 404)
    const parsed = rsvpSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

    const found = await db.query.events.findFirst({
      where: and(eq(events.id, eventId), isNull(events.cancelledAt)),
      columns: { id: true, title: true, startsAt: true, endsAt: true, restaurantId: true },
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

    if (parsed.data.status === 'going' && !wasGoing && isUpcoming(found, new Date())) {
      const recipients = await eventGoingRecipients(me)
      notify(
        recipients.map((userId) => ({
          userId,
          kind: 'event_going' as const,
          dedupeKey: `event_going:${eventId}:${me.id}`,
          actorId: me.id,
          eventId,
          restaurantId: found.restaurantId,
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
    if (!z.string().uuid().safeParse(eventId).success) return c.json({ error: 'not_found' }, 404)
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
