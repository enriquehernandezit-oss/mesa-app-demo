// The Feed's flat row list, built from the pages the server sent: a friend card per
// ranking, a "People you may know" shelf after every SHELF_EVERY cards, and one
// "You're caught up · older below" divider where what you've already seen begins.
// Pure (no React Native imports) so it is unit-tested with the other lib/*.test.ts.

export const SHELF_EVERY = 6
export const SHELF_SIZE = 3

export type FeedRow<Card, Person> =
  | { type: 'card'; key: string; item: Card }
  | { type: 'shelf'; key: string; people: Person[] }
  | { type: 'caught_up'; key: 'caught_up' }

export function buildFeedRows<Card extends { rankingId: string; rankedAt: string }, Person>({
  items,
  people,
  seenAt,
  shelves,
}: {
  items: Card[]
  // Suggested people, best first. Shelf k shows people[k*SHELF_SIZE ...] and there is
  // no shelf once the list runs out (a shelf of one looks like a mistake).
  people: Person[]
  // The newest ranking the member had seen when they last left the Feed (an ISO
  // string), or null on a first visit — then there is no divider at all.
  seenAt: string | null
  // False on the Friends view: nothing but friends' rankings there.
  shelves: boolean
}): FeedRow<Card, Person>[] {
  const seen = seenAt ? new Date(seenAt).getTime() : null
  const rows: FeedRow<Card, Person>[] = []
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
  })
  return rows
}
