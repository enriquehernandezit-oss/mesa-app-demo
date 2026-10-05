// Screen names are route paths: ids are fine, but /u/handle/<handle> carries a person's @handle, which
// analytics' ids-only rule keeps out.
export const screenName = (path: string): string =>
  path.replace(/^\/u\/handle\/[^/]+/, '/u/handle/:handle')
