import { firstName } from './mutualLine'
import type { EventSummary } from './types'

// The line about who is going to an event: how many of the people you follow, else how many
// people at all, else an invitation to be first. `t` is the bound translator (useT()).
//
// The API sends the TRUE friend count (`friendsGoingCount`) beside the first three faces, so
// "32 friends going" can be said outright — the exact number, not "5+".
export function goingLabel(
  t: (
    key: 'events.friends_going_count' | 'events.going_count' | 'events.be_first',
    vars?: { n?: number },
  ) => string,
  e: Pick<EventSummary, 'friendsGoingCount'> & { goingCount: number },
): string {
  if (e.friendsGoingCount > 0) return t('events.friends_going_count', { n: e.friendsGoingCount })
  if (e.goingCount > 0) return t('events.going_count', { n: e.goingCount })
  return t('events.be_first')
}

// Who, by name: "Ana is going", "Ana and Luis are going", "Ana, Luis and 3 more are going". The
// API sends the first three friends and the true count, so the rest is count minus the two named.
// Chosen by hand rather than by the dictionary's plural, as in lib/mutualLine.
export function friendsNamedLine(
  t: (
    key: 'events.friends_named_one' | 'events.friends_named_two' | 'events.friends_named_many',
    vars?: { a?: string; b?: string; n?: number },
  ) => string,
  e: Pick<EventSummary, 'friendsGoing' | 'friendsGoingCount'>,
): string | null {
  const [first, second] = e.friendsGoing
  if (e.friendsGoingCount <= 0 || !first) return null
  if (e.friendsGoingCount === 1 || !second) {
    return t('events.friends_named_one', { a: firstName(first.name) })
  }
  if (e.friendsGoingCount === 2) {
    return t('events.friends_named_two', { a: firstName(first.name), b: firstName(second.name) })
  }
  return t('events.friends_named_many', {
    a: firstName(first.name),
    b: firstName(second.name),
    n: e.friendsGoingCount - 2,
  })
}
