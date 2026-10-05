import type { MutualSummary } from './types'

// "Followed by Ana", "Followed by Ana and Luis", "Followed by Ana, Luis and 3 more" — who among
// my people also follows this person. First names only (a full name makes the line wrap); the
// list the line opens has the whole names. `t` is the bound translator (useT()).
//
// Chosen by hand, not by the dictionary's plural (which keys off `n === 1`): the count that
// matters here is how many are left over after the names shown.
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name

export function mutualLine(
  t: (
    key: 'friends.mutual_one' | 'friends.mutual_two' | 'friends.mutual_many',
    vars?: { a?: string; b?: string; n?: number },
  ) => string,
  mutual: MutualSummary,
): string | null {
  const [first, second] = mutual.sample
  if (mutual.count <= 0 || !first) return null
  if (mutual.count === 1) return t('friends.mutual_one', { a: firstName(first.name) })
  if (!second) return t('friends.mutual_one', { a: firstName(first.name) })
  if (mutual.count === 2) {
    return t('friends.mutual_two', { a: firstName(first.name), b: firstName(second.name) })
  }
  return t('friends.mutual_many', {
    a: firstName(first.name),
    b: firstName(second.name),
    n: mutual.count - 2,
  })
}
