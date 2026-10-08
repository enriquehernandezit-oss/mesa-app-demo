import { db, schema } from '@mesa/db'
import { and, inArray, isNull, or } from 'drizzle-orm'

import { goingPushKey } from './eventPush'
import { type NotificationRow, pushCopy, pushPayload } from './notifyCopy'
import { type PushCategory, type PushMessage, pushEnabled, sendPush } from './push'
import { sdLocalNow } from './sdTime'

// The one way anything reaches a member's bell: `notify()` writes an inbox row (the
// notifications table) and, for the rows it actually wrote, sends the push. Every trigger in
// routes/ and lib/pushSweep.ts calls it — Activity, the badge and the push are three views
// of the same row, so they can't disagree, and a push can never go out without an inbox
// row behind it.
const { notifications, user, userBlocks, restaurants, events, dishes } = schema
type Kind = schema.NotificationKind

interface KindRule {
  // The preference switch that gates this kind's PUSH (the inbox row is written regardless).
  category: PushCategory
  // A push_log key that limits pushes further than the inbox row's own dedupe does — one
  // push per (recipient, key), however many rows land under it. Without one, every new
  // row pushes.
  throttle?: (n: NotificationRow) => string
}

const hourBucket = (d: Date) => d.toISOString().slice(0, 13)

// Exhaustive on purpose: a new NotificationKind doesn't compile until it says which switch
// gates it (and notifyCopy.ts, which says what it reads).
export const KIND_RULES: Record<Kind, KindRule> = {
  follow: { category: 'social' },
  // Asking to follow a private account — one push per (asker, recipient) an hour, so
  // request / cancel / request can't be used to ping someone over and over.
  follow_request: {
    category: 'social',
    throttle: (n) => `follow-request:${n.actorId}:${hourBucket(n.createdAt)}`,
  },
  follow_accepted: { category: 'social' },
  // "≤1 push per ranking per hour": a burst of cheers from different friends inside one
  // hour claims the same push_log row, so only the first pushes. Every cheer still lands
  // in the inbox.
  cheers: {
    category: 'social',
    throttle: (n) => `cheers:${n.rankingId}:${hourBucket(n.createdAt)}`,
  },
  dish_cheer: {
    category: 'social',
    throttle: (n) => `dish-cheer:${n.dishId}:${hourBucket(n.createdAt)}`,
  },
  // One push per (sender, recipient) an hour for the three things a person can aim at someone else —
  // a comment, a mention, a plan invite — so one member cannot flood another's phone. Every one still
  // lands in the inbox; only the buzz is limited.
  comment: {
    category: 'social',
    throttle: (n) => `comment:${n.actorId}:${n.userId}:${hourBucket(n.createdAt)}`,
  },
  // One push per (recipient, place), however many friends rank it.
  saved_ranked: {
    category: 'friends',
    throttle: (n) => `saved-ranked:${n.restaurantId}:${n.userId}`,
  },
  plan_invite: {
    category: 'plans',
    throttle: (n) => `plan-invite:${n.actorId}:${n.userId}:${hourBucket(n.createdAt)}`,
  },
  plan_reply: { category: 'plans' },
  // A follower is pushed about a given event at most once per few hours, however many of the
  // people they follow sign up in it (lib/eventPush.ts).
  event_going: {
    category: 'events',
    throttle: (n) => goingPushKey(n.eventId ?? '', n.createdAt),
  },
  event_cancelled: { category: 'events' },
  // Sent by a person to a person, like a plan invite: one push per (sender, recipient) an hour.
  event_share: {
    category: 'events',
    throttle: (n) => `event-share:${n.actorId}:${n.userId}:${hourBucket(n.createdAt)}`,
  },
  // Sent by a person to a person, like an event or a plan invite: one push per (sender, recipient) an hour.
  place_share: {
    category: 'friends',
    throttle: (n) => `place-share:${n.actorId}:${n.userId}:${hourBucket(n.createdAt)}`,
  },
  dish_nudge: { category: 'dishes' },
  // At most one friends-love push a day however many places cross the line (the rest wait in the
  // inbox).
  friends_love: {
    category: 'friends',
    // The Santo Domingo day, so the cap resets at midnight there and not at 8 PM (UTC midnight),
    // which let two arrive in one evening.
    throttle: (n) => `friends-love:${sdLocalNow(n.createdAt).toISOString().slice(0, 10)}`,
  },
  taste_match: { category: 'friends' },
  // Each mention is its own inbox row (keyed by where it was said). It is the one thing here a
  // stranger-to-be can send you, so it rides the social switch like comments do, and shares the
  // hourly sender→recipient push cap.
  mention: {
    category: 'social',
    throttle: (n) => `mention:${n.actorId}:${n.userId}:${hourBucket(n.createdAt)}`,
  },
}

export interface NotifyInput {
  // The recipient.
  userId: string
  kind: Kind
  // What the event IS, unique per recipient — see the notifications table's own header.
  dedupeKey: string
  actorId?: string | null
  restaurantId?: string | null
  rankingId?: string | null
  commentId?: string | null
  dishId?: string | null
  eventId?: string | null
  planId?: string | null
  dishListId?: string | null
  data?: schema.NotificationData
}

const pair = (a: string, b: string) => `${a}\u0000${b}`
// Under Postgres' 65,535-parameter cap with room to spare (15 columns a row).
const INSERT_CHUNK = 500

// Who may be told: not banned, not the actor themselves, and no block either way between
// recipient and actor. Two queries however many people.
async function eligible(inputs: NotifyInput[]): Promise<NotifyInput[]> {
  const others = inputs.filter((i) => i.userId !== i.actorId)
  if (others.length === 0) return []
  const recipients = [...new Set(others.map((i) => i.userId))]
  const actors = [...new Set(others.flatMap((i) => (i.actorId ? [i.actorId] : [])))]

  const [active, blocks] = await Promise.all([
    db
      .select({ id: user.id })
      .from(user)
      .where(and(inArray(user.id, recipients), isNull(user.bannedAt))),
    actors.length === 0
      ? Promise.resolve([])
      : db
          .select({ blocker: userBlocks.blockerId, blocked: userBlocks.blockedId })
          .from(userBlocks)
          .where(
            or(
              and(inArray(userBlocks.blockerId, recipients), inArray(userBlocks.blockedId, actors)),
              and(inArray(userBlocks.blockerId, actors), inArray(userBlocks.blockedId, recipients)),
            ),
          ),
  ])
  const alive = new Set(active.map((r) => r.id))
  const blocked = new Set(
    blocks.flatMap((b) => [pair(b.blocker, b.blocked), pair(b.blocked, b.blocker)]),
  )
  return others.filter(
    (i) => alive.has(i.userId) && !(i.actorId && blocked.has(pair(i.userId, i.actorId))),
  )
}

// Writes the inbox rows and returns the ones that were NEW (a repeat of the same event hits
// the unique key and writes nothing), then pushes exactly those. Awaited by the sweeps and
// the tests; the write paths go through `notify` below.
export async function notifyNow(inputs: NotifyInput[]): Promise<NotificationRow[]> {
  const toWrite = await eligible(inputs)
  const written: NotificationRow[] = []
  for (let i = 0; i < toWrite.length; i += INSERT_CHUNK) {
    const rows = await db
      .insert(notifications)
      .values(
        toWrite.slice(i, i + INSERT_CHUNK).map((n) => ({
          userId: n.userId,
          kind: n.kind,
          dedupeKey: n.dedupeKey,
          actorId: n.actorId ?? null,
          restaurantId: n.restaurantId ?? null,
          rankingId: n.rankingId ?? null,
          commentId: n.commentId ?? null,
          dishId: n.dishId ?? null,
          eventId: n.eventId ?? null,
          planId: n.planId ?? null,
          dishListId: n.dishListId ?? null,
          data: n.data ?? null,
        })),
      )
      .onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] })
      .returning()
    written.push(...rows)
  }
  pushNew(written)
  return written
}

// Notifications still being written — see settleNotify.
const inFlight = new Set<Promise<unknown>>()

// Fire-and-forget, by the same convention sendPush always had: write paths call
// `notify([...])` without awaiting it — a failed insert or a slow push must never slow down
// or fail the write it's attached to. Errors are logged, not thrown.
export function notify(inputs: NotifyInput[]): void {
  if (inputs.length === 0) return
  background(() => notifyNow(inputs), 'notify failed')
}

// Work that decides WHAT to notify (a query first, then notify) is fire-and-forget too, and
// settleNotify must wait for it as well — so it registers here instead of floating free.
export function background(work: () => Promise<unknown>, failure: string): void {
  const p = work().catch((err) => console.error(failure, err))
  inFlight.add(p)
  void p.finally(() => inFlight.delete(p))
}

// Resolves once every notify() call so far has finished writing — for tests, which need to
// see the rows a route wrote after it had already answered.
export async function settleNotify(): Promise<void> {
  // Looped: work that decides what to notify (`background`) starts its notify() only after its own
  // query, so a single pass over the set would miss the writes it is about to register.
  while (inFlight.size > 0) await Promise.all(inFlight)
}

// ── push ────────────────────────────────────────────────────────────────

async function names(
  ids: string[],
  load: (ids: string[]) => Promise<{ id: string; name: string }[]>,
): Promise<Map<string, string>> {
  return ids.length === 0 ? new Map() : new Map((await load(ids)).map((r) => [r.id, r.name]))
}

const uniq = (ids: (string | null)[]): string[] => [...new Set(ids.filter((id) => id !== null))]

// The pushes for freshly written rows: names looked up in four batched queries at most (the
// actors, places, events and dishes the rows point at), then one PushMessage per row whose
// words are picked per recipient language when it's sent. Exported for the DB test.
export async function pushMessagesFor(rows: NotificationRow[]): Promise<PushMessage[]> {
  const [actors, places, eventTitles, dishNames] = await Promise.all([
    names(uniq(rows.map((r) => r.actorId)), (ids) =>
      db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, ids)),
    ),
    names(uniq(rows.map((r) => r.restaurantId)), (ids) =>
      db
        .select({ id: restaurants.id, name: restaurants.name })
        .from(restaurants)
        .where(inArray(restaurants.id, ids)),
    ),
    names(uniq(rows.map((r) => r.eventId)), (ids) =>
      db.select({ id: events.id, name: events.title }).from(events).where(inArray(events.id, ids)),
    ),
    names(uniq(rows.map((r) => r.dishId)), (ids) =>
      db.select({ id: dishes.id, name: dishes.name }).from(dishes).where(inArray(dishes.id, ids)),
    ),
  ])
  const from = (m: Map<string, string>, id: string | null) => (id ? (m.get(id) ?? null) : null)

  return rows.map((r) => {
    const rule = KIND_RULES[r.kind]
    const ctx = {
      actor: from(actors, r.actorId),
      place: from(places, r.restaurantId),
      event: from(eventTitles, r.eventId),
      dish: from(dishNames, r.dishId),
      data: r.data,
    }
    return {
      userId: r.userId,
      key: rule.throttle?.(r),
      category: rule.category,
      data: pushPayload(r),
      copy: (locale) => pushCopy(r.kind, locale, ctx),
    }
  })
}

// Only ever called with rows that were just written, so a repeat event can't push twice.
function pushNew(rows: NotificationRow[]): void {
  if (!pushEnabled() || rows.length === 0) return
  pushMessagesFor(rows)
    .then(sendPush)
    .catch((err) => console.error('notify push failed', err))
}
