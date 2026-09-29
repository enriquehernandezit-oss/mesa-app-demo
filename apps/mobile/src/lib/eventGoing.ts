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
