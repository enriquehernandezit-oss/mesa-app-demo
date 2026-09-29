// Score maths with no React Native imports, so it is unit-tested alongside the other
// lib/*.test.ts files. lib/display.ts re-exports it.

// Score display: stored 0–100, shown Beli-style as 0–10 with one decimal
// ("8.7"). One place so every screen and share card agrees.
export function displayScore(score: number): string {
  return (score / 10).toFixed(1)
}

// A score is a NUMBER + a WORD (docs/DESIGN.md): 9+ Must go, 8+ Great, 7+ Good, 5+ Fine,
// else Skip. The word is read off the number as it is DISPLAYED (one decimal), so a
// 89.96 that shows as "9.0" is also "Must go" — the two never disagree on screen.
export type ScoreWordKey =
  | 'score.must_go'
  | 'score.great'
  | 'score.good'
  | 'score.fine'
  | 'score.skip'

export function scoreWordKey(score: number): ScoreWordKey {
  const shown = Number(displayScore(score))
  if (shown >= 9) return 'score.must_go'
  if (shown >= 8) return 'score.great'
  if (shown >= 7) return 'score.good'
  if (shown >= 5) return 'score.fine'
  return 'score.skip'
}
