import { displayScore } from './score'
import type { PopularItem } from './types'

// The line under a Popular row about the people you follow who ranked it: "Diego ranked
// it 9.6", "Natalia and 1 other", "3 friends". The API sends how many and the highest of
// them; this words it. Null when none of your friends ranked it. `t` is the bound
// translator (useT()).
export function friendLine(
  t: (
    key: 'popular.friend_one' | 'popular.friend_two' | 'popular.friends_many',
    vars?: { name?: string; score?: string; n?: number },
  ) => string,
  f: PopularItem['friends'],
): string | null {
  if (f.count <= 0 || !f.name) return null
  if (f.count === 1)
    return f.score == null
      ? f.name
      : t('popular.friend_one', { name: f.name, score: displayScore(f.score) })
  if (f.count === 2) return t('popular.friend_two', { name: f.name })
  return t('popular.friends_many', { n: f.count })
}
