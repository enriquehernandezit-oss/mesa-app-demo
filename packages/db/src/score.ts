// The 0–100 score shown beside a rank is derived from the ordered position the
// pairwise flow produced — never entered directly (no stars, no numeric input).
// Linear spread, top of the list highest. The ONE formula: the API's rank/
// onboarding routes and the seed data all call this, so a seeded list and an
// app-ranked list score identically for the same relative position (a second,
// divergent copy of this formula in seed-data.ts previously scored seeded
// rankings 95→62 while the API scored 96→72 — same shape, different numbers,
// which skewed every cross-user average).
export function scoreFor(index: number, total: number): number {
  if (total <= 1) return 95
  const top = 96
  const bottom = 72
  return Math.round(top - (index * (top - bottom)) / (total - 1))
}
