import { displayScore } from './score'
import type { SixReason } from './types'

// Why a place is in "Your six", as the one line under its name — the server sends the
// reason as data, this words it. `t` is the bound translator (useT()).
//
// The friend line is built by hand: "Diego · 9.6", or "Diego +2 · 9.6" when more friends
// ranked it. The score is the friend's, shown the way every score is (0–10).
export function sixReasonLine(
  t: (
    key: 'home.six_saved_friends' | 'home.six_saved' | 'home.six_trending',
    vars?: { n?: number },
  ) => string,
  reason: SixReason,
): string {
  if (reason.kind === 'friend') {
    const who = reason.more > 0 ? `${reason.name} +${reason.more}` : reason.name
    return `${who} · ${displayScore(reason.score)}`
  }
  if (reason.kind === 'saved_friends') return t('home.six_saved_friends', { n: reason.count })
  if (reason.kind === 'saved') return t('home.six_saved')
  return t('home.six_trending')
}
