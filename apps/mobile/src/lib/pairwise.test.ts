/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test'
import {
  type PairwiseState,
  choose,
  comparisonsLeft,
  initInsert,
  initInsertBounded,
  nextComparison,
  tie,
} from './pairwise'

// Deterministic PRNG (mulberry32 — same algorithm the DB package's seed script
// uses) so a failing trial is reproducible from the seed alone.
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(arr: T[], rand: () => number): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  return out
}

// A "place" carrying its hidden ground-truth rank (0 = best). The oracle only
// ever consults `truth`, mirroring a user who answers every comparison
// honestly against their own real preference.
type P = { id: number; truth: number }

describe('initInsert (unbanded) — full-list reconstruction', () => {
  test('inserting items one at a time, in random order, reproduces the true sort for many trials', () => {
    for (let trial = 0; trial < 200; trial++) {
      const rand = mulberry32(trial + 1)
      const n = 1 + Math.floor(rand() * 40) // 1..40
      const items: P[] = Array.from({ length: n }, (_, i) => ({ id: i, truth: i }))
      const insertionOrder = shuffled(items, rand)

      let ordered: P[] = []
      for (const item of insertionOrder) {
        let state = initInsert(ordered, item)
        while (state.current !== null) {
          const cmp = nextComparison(state)
          if (cmp === null) break
          state = choose(state, cmp.current.truth < cmp.pivot.truth)
        }
        ordered = state.ordered
      }

      expect(ordered.map((p) => p.truth)).toEqual(
        [...items].sort((a, b) => a.truth - b.truth).map((p) => p.truth),
      )
    }
  })

  test('empty and single-item lists need no comparisons', () => {
    const item: P = { id: 0, truth: 0 }
    const empty = initInsert<P>([], item)
    expect(empty.ordered).toEqual([item])
    expect(nextComparison(empty)).toBeNull()

    const one = initInsert<P>([{ id: 1, truth: 5 }], item)
    // A single existing item still needs exactly one comparison (span 1).
    expect(comparisonsLeft(one)).toBe(1)
  })
})

describe('initInsertBounded — sentiment bands', () => {
  // For an `existing` list already sorted best-first as [0, 1, ..., n-1] (the
  // array's own values ARE the true ranks), the correct unclamped insertion
  // index for a new value `v` is exactly how many existing values are < v.
  function correctIndex(existing: number[], v: number): number {
    return existing.filter((x) => x < v).length
  }

  test('bands partition [0, n] with no gaps and no overlap, for every n >= 3', () => {
    for (let n = 3; n <= 50; n++) {
      const existing = Array.from({ length: n }, (_, i) => i)
      const loved = initInsertBounded(existing, -1, 'loved')
      const fine = initInsertBounded(existing, -1, 'fine')
      const disliked = initInsertBounded(existing, -1, 'disliked')
      expect(loved.lo).toBe(0)
      expect(loved.hi).toBe(fine.lo)
      expect(fine.hi).toBe(disliked.lo)
      expect(disliked.hi).toBe(n)
      // Every band is non-empty.
      expect(loved.hi).toBeGreaterThan(loved.lo)
      expect(fine.hi).toBeGreaterThan(fine.lo)
      expect(disliked.hi).toBeGreaterThan(disliked.lo)
    }
  })

  test('n < 3 skips the band entirely (full range, matches initInsert)', () => {
    for (const n of [0, 1, 2]) {
      const existing = Array.from({ length: n }, (_, i) => i)
      for (const sentiment of ['loved', 'fine', 'disliked'] as const) {
        const bounded = initInsertBounded(existing, -1, sentiment)
        const plain = initInsert(existing, -1)
        expect(bounded.lo).toBe(plain.lo)
        expect(bounded.hi).toBe(plain.hi)
      }
    }
  })

  test('a well-calibrated sentiment (matching the item’s true tercile) lands exactly at its true position — the band never distorts an honest answer', () => {
    for (let trial = 0; trial < 300; trial++) {
      const rand = mulberry32(1000 + trial)
      const n = 3 + Math.floor(rand() * 47) // 3..49
      const existing = Array.from({ length: n }, (_, i) => i)
      const v = rand() * n // a random true value among the n existing ones
      const trueIdx = correctIndex(existing, v) // 0..n, unclamped

      const loved = Math.ceil(n / 3)
      const disliked = Math.floor(n / 3)
      const sentiment = trueIdx < loved ? 'loved' : trueIdx >= n - disliked ? 'disliked' : 'fine'

      let state = initInsertBounded(existing, v, sentiment)
      while (state.current !== null) {
        const cmp = nextComparison(state)
        if (cmp === null) break
        state = choose(state, (cmp.current as number) < (cmp.pivot as number))
      }

      expect(state.ordered.indexOf(v)).toBe(trueIdx)
    }
  })

  test('a mis-calibrated sentiment still lands inside the chosen band, never at the true position outside it — the documented hard clamp', () => {
    // A place the user says they "loved" but that actually belongs dead last:
    // the band forces it into the top third regardless of what it's compared
    // against, by design (Enrique's call — see pairwise.ts's doc comment).
    const n = 30
    const existing = Array.from({ length: n }, (_, i) => i)
    const v = n + 1000 // true value larger than everything — "loses" every comparison
    let state = initInsertBounded(existing, v, 'loved')
    const loved = Math.ceil(n / 3)
    while (state.current !== null) {
      const cmp = nextComparison(state)
      if (cmp === null) break
      // Honest oracle: v is larger than every pivot, so v always "loses"
      // (ranks worse) — an unbanded search would push it to the very end.
      state = choose(state, (cmp.current as number) < (cmp.pivot as number))
    }
    const finalIdx = state.ordered.indexOf(v)
    expect(finalIdx).toBeGreaterThanOrEqual(0)
    expect(finalIdx).toBeLessThanOrEqual(loved)
    expect(finalIdx).toBeLessThan(n) // nowhere near the true worst-of-30 position
  })
})

describe('tie', () => {
  test('always settles within [lo, hi] of the state it was called on', () => {
    for (let n = 1; n <= 12; n++) {
      for (let lo = 0; lo <= n; lo++) {
        for (let hi = lo; hi <= n; hi++) {
          const ordered = Array.from({ length: n }, (_, i) => i)
          const state = { ordered, queue: [], current: -1, lo, hi, total: n + 1 }
          const result = tie(state)
          const idx = result.ordered.indexOf(-1)
          expect(idx).toBeGreaterThanOrEqual(lo)
          expect(idx).toBeLessThanOrEqual(hi)
        }
      }
    }
  })

  test('zero-width band (lo === hi) does not splice past hi — the exact regression this fixes', () => {
    const ordered = [10, 20, 30]
    const state = { ordered, queue: [], current: -1, lo: 2, hi: 2, total: 4 }
    const result = tie(state)
    expect(result.ordered.indexOf(-1)).toBe(2)
    expect(result.ordered.length).toBe(4)
  })
})

describe('comparisonsLeft', () => {
  test('matches the exact number of comparisons an adversarial oracle forces, for many random spans', () => {
    for (let trial = 0; trial < 500; trial++) {
      const rand = mulberry32(5000 + trial)
      const n = Math.floor(rand() * 60) // 0..59
      const ordered = Array.from({ length: n }, (_, i) => i)
      let state: PairwiseState<number> = {
        ordered,
        queue: [],
        current: -1,
        lo: 0,
        hi: n,
        total: n + 1,
      }
      const predicted = comparisonsLeft(state)

      let actual = 0
      while (state.current !== null) {
        const cmp = nextComparison(state)
        if (cmp === null) break
        // Adversary: always answer whichever way keeps the LARGER remaining
        // span, so the path taken is the worst case the estimate must cover.
        const mid = (state.lo + state.hi) >> 1
        const loseSpan = state.hi - (mid + 1)
        const winSpan = mid - state.lo
        state = choose(state, winSpan >= loseSpan)
        actual++
      }

      expect(actual).toBe(predicted)
    }
  })
})
