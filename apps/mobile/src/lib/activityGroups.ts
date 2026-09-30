import type { NotificationItem, NotificationKind } from './types'

// How the Activity screen sorts the inbox: which pill each kind belongs under, and which
// Today / This week / Earlier section a row falls in. Pure, so it is unit-tested.
export type ActivityFilter = 'all' | 'followers' | 'rankings' | 'plans' | 'events'
export const FILTERS: ActivityFilter[] = ['all', 'followers', 'rankings', 'plans', 'events']

// One home per kind — a Record, so a new NotificationKind doesn't compile until it has one.
const FILTER_OF: Record<NotificationKind, Exclude<ActivityFilter, 'all'>> = {
  follow: 'followers',
  cheers: 'rankings',
  dish_cheer: 'rankings',
  comment: 'rankings',
  saved_ranked: 'rankings',
  dish_nudge: 'rankings',
  plan_invite: 'plans',
  plan_reply: 'plans',
  event_going: 'events',
  event_cancelled: 'events',
}

export const matchesFilter = (kind: NotificationKind, filter: ActivityFilter): boolean =>
  filter === 'all' || FILTER_OF[kind] === filter

export type ActivityBucket = 'today' | 'week' | 'earlier'

// Today = since local midnight; This week = the six days before that; the rest is Earlier.
export function bucketOf(iso: string, now: Date): ActivityBucket {
  const at = new Date(iso).getTime()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (at >= startToday) return 'today'
  if (at >= startToday - 6 * 86_400_000) return 'week'
  return 'earlier'
}

// Newest-first rows, split into the sections that have any, in order. Also drops a repeated
// id — pages are cursor-stable, but a refetch mid-scroll must never render a row twice.
export function groupByBucket(
  items: NotificationItem[],
  now: Date,
): { key: ActivityBucket; data: NotificationItem[] }[] {
  const seen = new Set<string>()
  const buckets: Record<ActivityBucket, NotificationItem[]> = { today: [], week: [], earlier: [] }
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    buckets[bucketOf(item.createdAt, now)].push(item)
  }
  return (['today', 'week', 'earlier'] as const)
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, data: buckets[key] }))
}
