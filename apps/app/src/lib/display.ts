// Score display: stored 0–100, shown Beli-style as 0–10 with one decimal
// ("8.7"). One place so every screen and share card agrees.
export function displayScore(score: number): string {
  return (score / 10).toFixed(1)
}

// Price tier (1–4) as $ signs.
export function priceLabel(tier: number | null | undefined): string | null {
  if (!tier || tier < 1) return null
  return '$'.repeat(Math.min(tier, 4))
}

// Match % color: strong matches glow brass, weak ones stay dim.
export function matchColor(pct: number): string {
  if (pct >= 75) return 'var(--accent-strong)'
  if (pct >= 50) return 'var(--accent)'
  return 'var(--text-muted)'
}
