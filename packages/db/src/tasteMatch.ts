import { SCORE_BOTTOM, SCORE_TOP } from './score'

// Taste match (M16) — replaces the old "100 minus the average score gap"
// formula, which was linear and unbounded: two people who'd only ranked one
// shared place, on opposite ends, read as a confident "0% match" off a
// single data point, and the SAME 8-point average gap meant something
// different at 2 shared places than at 20. Dampens for small samples
// instead, and needs 3 shared places (was 2) before showing anything at all.
export const MIN_SHARED_FOR_MATCH = 3

// How far apart two people's scores for the SAME place can plausibly get.
// scoreFor's own range (score.ts) is [SCORE_BOTTOM, SCORE_TOP], a 24-point
// span — but reaching each other's exact extreme on a place you BOTH ranked
// is the rare case, not the norm (a place you both bothered to rank is
// already more likely to be one you both liked at least somewhat). Damped to
// 2/3 of the full range: a person landing near the true opposite end for
// real, across several shared places, is genuinely "opposite taste," not
// just unlucky sampling.
const SCORE_SPAN = SCORE_TOP - SCORE_BOTTOM
const OPPOSITE_GAP = (SCORE_SPAN * 2) / 3

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// avgGap: the mean of |my score − their score| over every place you've both
// ranked. sharedCount: how many places that average is over. Takes the two
// aggregates directly, not the raw per-place gaps — both are exactly what a
// single SQL aggregate query already produces (count(*), avg(abs(diff))),
// which is the whole point: the caller never has to fetch per-place rows
// just to compute a percentage. Returns null below MIN_SHARED_FOR_MATCH —
// there's no honest percentage to show off one or two shared places, only
// noise.
//
// raw = clamp(1 − avgGap / OPPOSITE_GAP, 0, 1): identical scores → 1,
// avgGap at half of OPPOSITE_GAP → 0.5 ("unrelated" — the neutral case, not
// a penalty), avgGap at or past OPPOSITE_GAP → 0.
//
// shown pulls raw toward 50% by a factor that shrinks as sharedCount grows
// (n/(n+2)): at n=3 a perfect match reads as 80%, not 100% — three shared
// places is real evidence, but not proof; at n→∞ it approaches raw's own
// extremes. An "unrelated" pair (raw=0.5) always shows 50% regardless of n,
// which is the correct fixed point — more data about "we're unrelated"
// doesn't make you MORE unrelated.
export function tasteMatch(avgGap: number, sharedCount: number): number | null {
  const n = sharedCount
  if (n < MIN_SHARED_FOR_MATCH) return null
  const raw = clamp(1 - avgGap / OPPOSITE_GAP, 0, 1)
  const damped = 0.5 + (raw - 0.5) * (n / (n + 2))
  return Math.round(100 * clamp(damped, 0, 1))
}

// Whether one shared place's score gap counts as "agreement" — used to split
// the pair page into "Donde coinciden" / "Donde no". Same "unrelated"
// reference point the formula itself uses (avgGap at half of OPPOSITE_GAP is
// exactly the 50% fixed point), so the split can never drift from what the
// percentage above it means.
export function isAgreement(gap: number): boolean {
  return gap < OPPOSITE_GAP / 2
}
