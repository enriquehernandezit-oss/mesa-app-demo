// The 0–100 score shown beside a rank is derived from the ordered position the
// pairwise flow produced — never entered directly (no stars, no numeric input).
// Linear spread, top of the list highest. The ONE formula: the API's rank/
// onboarding routes and the seed data all call this, so a seeded list and an
// app-ranked list score identically for the same relative position (a second,
// divergent copy of this formula in seed-data.ts previously scored seeded
// rankings 95→62 while the API scored 96→72 — same shape, different numbers,
// which skewed every cross-user average).
// Exported (M16) so tasteMatch.ts's "how far apart can two scores be" span
// derives from these instead of guessing its own number — the two formulas
// must never drift on what the score scale even means.
export const SCORE_TOP = 96
export const SCORE_BOTTOM = 72

export function scoreFor(index: number, total: number): number {
  if (total <= 1) return 95
  return Math.round(SCORE_TOP - (index * (SCORE_TOP - SCORE_BOTTOM)) / (total - 1))
}
