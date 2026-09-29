// Popular: the city's places, ranked by MOMENTUM × QUALITY. Pure (no database, no
// framework) so the rules are unit-tested in lib/popular.test.ts; routes/popular.ts only
// fetches the raw sums these rules need.
//
//   · Quality is the average score, pulled toward the city's own average when few people
//     have ranked a place (a Bayesian mean, weight PRIOR_WEIGHT): three friends' 10s don't
//     outrank a place two hundred people rate 9.
//   · Momentum is what happened in the last WEEK_DAYS: each new ranking counts its score,
//     fading by half every HALF_LIFE_DAYS; a save and a cheer each add a little.
//   · A place needs MIN_RANKERS people behind it, and at least one new ranking this week,
//     to be "popular this week". The top WEEK_TOP by momentum × quality come first; after
//     them the list carries on with every other eligible place by all-time quality, so it
//     never just stops.

export const MIN_RANKERS = 3
export const PRIOR_WEIGHT = 5
export const WEEK_DAYS = 7
export const HALF_LIFE_DAYS = 3
export const SAVE_WEIGHT = 0.5
export const CHEER_WEIGHT = 0.25
export const WEEK_TOP = 50
export const PAGE_SIZE = 20
export const NEW_DAYS = 21

// Everything the rules need to know about one place. Scores are stored 0–100.
export type PopularAgg = {
  id: string
  // People (not banned, not blocked) who ranked it, ever, and the sum of their scores.
  rankers: number
  sumScore: number
  // Rankings made in the last WEEK_DAYS: how many, and Σ score/100 · 0.5^(age / half-life).
  weekRankings: number
  weekWeight: number
  // Saves and cheers in the last WEEK_DAYS.
  saves: number
  cheers: number
}

// The average score across every ranking in the city — the value small samples drift to.
// Falls back to a middling 75 (the centre of the stored 50–100 range) with no rankings.
export function cityMean(aggs: Pick<PopularAgg, 'rankers' | 'sumScore'>[]): number {
  const n = aggs.reduce((s, a) => s + a.rankers, 0)
  return n === 0 ? 75 : aggs.reduce((s, a) => s + a.sumScore, 0) / n
}

// (Σ scores + m · city mean) / (rankers + m): the average, shrunk toward the city's.
export function quality(a: Pick<PopularAgg, 'rankers' | 'sumScore'>, mean: number): number {
  return (a.sumScore + PRIOR_WEIGHT * mean) / (a.rankers + PRIOR_WEIGHT)
}

export function momentum(a: Pick<PopularAgg, 'weekWeight' | 'saves' | 'cheers'>): number {
  return a.weekWeight + SAVE_WEIGHT * a.saves + CHEER_WEIGHT * a.cheers
}

export type Phase = 'week' | 'all'
export type PopularEntry<A> = { agg: A; phase: Phase; key: number }

const byKey = <A extends { id: string }>(a: PopularEntry<A>, b: PopularEntry<A>) =>
  b.key - a.key || a.agg.id.localeCompare(b.agg.id)

// The whole list, in order: the week's top WEEK_TOP by momentum × quality, then the rest
// by quality. Ties fall to the id, so the order is stable from one request to the next.
export function rankPopular<A extends PopularAgg>(
  aggs: A[],
  mean: number,
  weekTop = WEEK_TOP,
): PopularEntry<A>[] {
  const eligible = aggs.filter((a) => a.rankers >= MIN_RANKERS)
  const week = eligible
    .filter((a) => a.weekRankings >= 1)
    .map((agg): PopularEntry<A> => ({
      agg,
      phase: 'week',
      key: (momentum(agg) * quality(agg, mean)) / 100,
    }))
    .sort(byKey)
    .slice(0, weekTop)
  const inWeek = new Set(week.map((e) => e.agg.id))
  const rest = eligible
    .filter((a) => !inWeek.has(a.id))
    .map((agg): PopularEntry<A> => ({ agg, phase: 'all', key: quality(agg, mean) }))
    .sort(byKey)
  return [...week, ...rest]
}

// ── Paging ───────────────────────────────────────────────────────────────────
// A cursor is a place in the ordering — (phase, key, id) — not a row count, so a page
// boundary holds still while rankings arrive between requests. It also carries `asOf`,
// the moment the first page was scored: momentum fades with time, so scoring page two a
// minute later would nudge every key down and the last row of page one would sort after
// its own cursor and appear twice. Every page of one scroll is scored as of the same
// instant, so the keys it compares are the very ones it was handed.

export type PopularCursor = { phase: Phase; key: number; id: string; asOf: number }

export const encodeCursor = (c: PopularCursor): string =>
  `${c.phase === 'week' ? 'w' : 'a'}:${c.key}:${c.asOf}:${c.id}`

export function parseCursor(raw: string): PopularCursor | null {
  const [p, k, a, ...rest] = raw.split(':')
  const id = rest.join(':')
  const key = Number(k)
  const asOf = Number(a)
  if ((p !== 'w' && p !== 'a') || !k || !Number.isFinite(key) || !a || !(asOf > 0) || !id)
    return null
  return { phase: p === 'w' ? 'week' : 'all', key, id, asOf }
}

// Is `a` after `b` in the ordering? (week before all; then higher key first; then id.)
function follows(a: Omit<PopularCursor, 'asOf'>, b: Omit<PopularCursor, 'asOf'>): boolean {
  if (a.phase !== b.phase) return a.phase === 'all'
  return a.key !== b.key ? a.key < b.key : a.id.localeCompare(b.id) > 0
}

export function pageAfter<A extends { id: string }>(
  entries: PopularEntry<A>[],
  cursor: PopularCursor | null,
  asOf: number,
  size = PAGE_SIZE,
): { page: PopularEntry<A>[]; next: string | null } {
  const rest = cursor
    ? entries.filter((e) => follows({ phase: e.phase, key: e.key, id: e.agg.id }, cursor))
    : entries
  const page = rest.slice(0, size)
  const last = page[page.length - 1]
  const next =
    rest.length > size && last
      ? encodeCursor({ phase: last.phase, key: last.key, id: last.agg.id, asOf })
      : null
  return { page, next }
}
