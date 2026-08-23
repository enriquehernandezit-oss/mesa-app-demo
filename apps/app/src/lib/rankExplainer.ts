// One-time "how it works" coachmark for the pairwise compare step — same
// localStorage-watermark shape as components/TopBar.tsx's activity watermark.
const KEY = 'mesa-rank-explainer-seen'

export function rankExplainerSeen(): boolean {
  return localStorage.getItem(KEY) === '1'
}

export function markRankExplainerSeen(): void {
  localStorage.setItem(KEY, '1')
}
