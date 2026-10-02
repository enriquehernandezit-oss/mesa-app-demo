// The Feed's flat row list, built from the pages the server sent: a friend card per
// ranking, a "People you may know" shelf after every SHELF_EVERY cards, an "Events this
// week" shelf between those (after card 3, 9, 15 …), one "New near you" shelf after the first
// SHELF_EVERY (or at the end of a shorter feed), and one "You're caught up · older below"
// divider where what you've already seen begins.
// Pure (no React Native imports) so it is unit-tested with the other lib/*.test.ts.

export const SHELF_EVERY = 6
export const SHELF_SIZE = 3
// The Events shelf sits halfway between two People shelves, so the two never touch.
export const EVENTS_AT = SHELF_EVERY / 2
export const EVENTS_SIZE = 6

export type FeedRow<Card, Person, Event = never> =
  | { type: 'card'; key: string; item: Card }
  | { type: 'shelf'; key: string; people: Person[] }
  | { type: 'events_shelf'; key: string; events: Event[] }
  | { type: 'new_near_you'; key: 'new_near_you' }
  | { type: 'caught_up'; key: 'caught_up' }

export function buildFeedRows<
  Card extends { rankingId: string; rankedAt: string },
  Person,
  Event = never,
>({
  items,
  people,
  events = [],
  seenAt,
  shelves,
  nearYou = false,
}: {
  items: Card[]
  // Suggested people, best first. Shelf k shows people[k*SHELF_SIZE ...] and there is
  // no shelf once the list runs out (a shelf of one looks like a mistake).
  people: Person[]
  // This week's events, soonest first. Events shelf k shows events[k*EVENTS_SIZE ...], so a
  // week with a few events gets one shelf and a busy one gets more — never the same card
  // twice. An events shelf of one is fine: it is a single thing happening, and tappable.
  events?: Event[]
  // The newest ranking the member had seen when they last left the Feed (an ISO
  // string), or null on a first visit — then there is no divider at all.
  seenAt: string | null
  // False on the Friends view: nothing but friends' rankings there.
  shelves: boolean
  // Whether there are new places to show. They sit after the first six cards — after the
  // People shelf when one follows them — or at the end of a feed shorter than that.
  nearYou?: boolean
}): FeedRow<Card, Person, Event>[] {
  const seen = seenAt ? new Date(seenAt).getTime() : null
  const rows: FeedRow<Card, Person, Event>[] = []
  const eventsShelf = (k: number): FeedRow<Card, Person, Event>[] => {
    const batch = events.slice(k * EVENTS_SIZE, (k + 1) * EVENTS_SIZE)
    return batch.length > 0 ? [{ type: 'events_shelf', key: `events:${k}`, events: batch }] : []
  }
  let dividerPlaced = seen === null
  items.forEach((item, i) => {
    // The divider sits before the first item that is not newer than the watermark. If
    // every loaded item is newer, the boundary is on a later page and there is none yet.
    if (!dividerPlaced && new Date(item.rankedAt).getTime() <= (seen ?? 0)) {
      rows.push({ type: 'caught_up', key: 'caught_up' })
      dividerPlaced = true
    }
    rows.push({ type: 'card', key: item.rankingId, item })
    if (shelves && (i + 1) % SHELF_EVERY === 0) {
      const k = (i + 1) / SHELF_EVERY - 1
      const batch = people.slice(k * SHELF_SIZE, (k + 1) * SHELF_SIZE)
      if (batch.length >= 2) rows.push({ type: 'shelf', key: `shelf:${k}`, people: batch })
    }
    if (shelves && (i + 1) % SHELF_EVERY === EVENTS_AT)
      rows.push(...eventsShelf((i + 1 - EVENTS_AT) / SHELF_EVERY))
    if (nearYou && i + 1 === SHELF_EVERY) rows.push({ type: 'new_near_you', key: 'new_near_you' })
  })
  // A feed too short to reach the first slots still gets its shelves, at the end: events first
  // (they are the one with a clock on it).
  if (shelves && items.length > 0 && items.length < EVENTS_AT) rows.push(...eventsShelf(0))
  if (nearYou && items.length > 0 && items.length < SHELF_EVERY)
    rows.push({ type: 'new_near_you', key: 'new_near_you' })
  return rows
}
