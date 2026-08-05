// The 0–100 score shown beside a rank is derived from the ordered position the
// pairwise flow produced — never entered directly (no stars, no numeric input).
// Linear spread, top of the list highest. Shared by onboarding's starter list
// and M3's rank-a-place so a list rescored either way looks identical.
export function scoreFor(index: number, total: number): number {
  if (total <= 1) return 95
  const top = 96
  const bottom = 72
  return Math.round(top - (index * (top - bottom)) / (total - 1))
}
