// The pairwise ranking engine — Mesa's atomic mechanic, shared by onboarding
// (M2) and the full rank-a-place flow (M3). No stars, ever: you place a spot by
// answering "this one or that one?" a handful of times.
//
// It's a binary-search insertion sort driven by the user. We keep an ordered
// list (best-first) and insert one new spot at a time; each insertion binary-
// searches for its slot, so placing a spot into a list of L costs ~log2(L)
// comparisons instead of L. Building a starter list of n spots is ~n·log2(n)
// questions total (≈15–22 for 8–10 spots).
//
// Pure and framework-free: the UI calls nextComparison() to get the question,
// then choose() with the winner to advance. State is a plain value.

export interface PairwiseState<T> {
  /** Settled so far, best-first. */
  ordered: T[]
  /** Spots not yet inserted. */
  queue: T[]
  /** The spot currently being placed (null once everything is placed). */
  current: T | null
  /** Binary-search bounds for `current` within `ordered`: [lo, hi). */
  lo: number
  hi: number
  /** Total spots in this session, for progress display. */
  total: number
}

export interface Comparison<T> {
  /** The spot being placed. */
  current: T
  /** The already-ranked spot to compare it against. */
  pivot: T
}

// Begin placing the next queued spot, or finish. Internal.
function startNext<T>(s: PairwiseState<T>): PairwiseState<T> {
  const [next, ...rest] = s.queue
  if (next === undefined) {
    return { ...s, current: null, queue: [], lo: 0, hi: 0 }
  }
  return { ...s, current: next, queue: rest, lo: 0, hi: s.ordered.length }
}

/**
 * Seed a session that places ONE new spot into an already-ordered list — the
 * rank-a-place flow (M3). Same binary search as building from scratch, just with
 * the existing list pre-loaded. When done, the new item's final slot is
 * `ordered.indexOf(item) + 1`. An empty list places the item at position 1 with
 * no comparisons.
 */
export function initInsert<T>(existing: T[], item: T): PairwiseState<T> {
  if (existing.length === 0) {
    return { ordered: [item], queue: [], current: null, lo: 0, hi: 0, total: 1 }
  }
  return {
    ordered: [...existing],
    queue: [],
    current: item,
    lo: 0,
    hi: existing.length,
    total: existing.length + 1,
  }
}

/** How the user felt about the place before placing it (Beli-style). */
export type Sentiment = 'loved' | 'fine' | 'disliked'

/**
 * initInsert, but the sentiment pre-narrows the binary search to the matching
 * third of the list — "loved" competes near the top, "disliked" near the bottom.
 * Fewer comparisons, and the question order feels right to the user.
 */
export function initInsertBounded<T>(
  existing: T[],
  item: T,
  sentiment: Sentiment,
): PairwiseState<T> {
  const base = initInsert(existing, item)
  if (base.current === null || existing.length < 3) return base
  const n = existing.length
  const third = Math.ceil(n / 3)
  if (sentiment === 'loved') return { ...base, lo: 0, hi: third }
  if (sentiment === 'disliked') return { ...base, lo: n - third, hi: n }
  return { ...base, lo: third, hi: Math.max(third + 1, n - third) }
}

/** Seed a session from an unordered set of spots. */
export function initPairwise<T>(items: T[]): PairwiseState<T> {
  if (items.length === 0) {
    return { ordered: [], queue: [], current: null, lo: 0, hi: 0, total: 0 }
  }
  const [first, ...rest] = items
  // The first spot needs no comparison; it defines the initial list.
  return startNext({
    ordered: [first as T],
    queue: rest,
    current: null,
    lo: 0,
    hi: 0,
    total: items.length,
  })
}

/** The question to ask now, or null when the list is fully ordered. */
export function nextComparison<T>(s: PairwiseState<T>): Comparison<T> | null {
  if (s.current === null) return null
  const mid = (s.lo + s.hi) >> 1
  const pivot = s.ordered[mid]
  if (pivot === undefined) return null // invariant guard; shouldn't happen
  return { current: s.current, pivot }
}

/**
 * Record the user's pick and advance. `currentWins` = they chose the spot being
 * placed over the pivot (it ranks higher). When the search narrows to a single
 * slot, the spot is inserted and the next one begins.
 */
export function choose<T>(s: PairwiseState<T>, currentWins: boolean): PairwiseState<T> {
  if (s.current === null) return s
  const mid = (s.lo + s.hi) >> 1
  // Higher rank = earlier index. A win moves the upper bound down; a loss moves
  // the lower bound past the pivot.
  let lo = s.lo
  let hi = s.hi
  if (currentWins) hi = mid
  else lo = mid + 1

  if (lo >= hi) {
    const ordered = [...s.ordered]
    ordered.splice(lo, 0, s.current)
    return startNext({ ...s, ordered, lo: 0, hi: 0 })
  }
  return { ...s, lo, hi }
}

/** True once every spot is placed. */
export function isDone<T>(s: PairwiseState<T>): boolean {
  return s.current === null && s.queue.length === 0
}

/** How many spots are fully settled — for a progress indicator. */
export function progress<T>(s: PairwiseState<T>): { placed: number; total: number } {
  // `ordered` holds settled spots; `current` is mid-placement so not yet counted.
  return { placed: s.ordered.length, total: s.total }
}
