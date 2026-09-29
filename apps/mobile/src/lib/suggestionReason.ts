import type { SuggestionReason } from './types'

// Why someone is suggested, as a line of copy — shared by Find friends and the Feed's
// "People you may know" shelf. `t` is the bound translator (useT()).
//
// The mutual line is chosen by hand, not by the dictionary's plural: a plural entry is
// picked by `n === 1`, and here `n` is the number of EXTRA people, so "one" would print
// "X follows them" for two followers and "and 0 more" for one.
export function reasonLine(
  t: (
    key:
      | 'friends.reason_mutual'
      | 'friends.reason_mutual_more'
      | 'friends.reason_taste'
      | 'friends.reason_popular',
    vars?: { name?: string; n?: number },
  ) => string,
  reason: SuggestionReason,
): string {
  if (reason.kind === 'mutual') {
    return reason.extraCount > 0
      ? t('friends.reason_mutual_more', { name: reason.name, n: reason.extraCount })
      : t('friends.reason_mutual', { name: reason.name, n: 1 })
  }
  if (reason.kind === 'taste') return t('friends.reason_taste', { n: reason.percent })
  return t('friends.reason_popular')
}
