// Pure (no React Native imports) so it is unit-tested with the other lib/*.test.ts.

// What a place's website link IS: half the catalog's "websites" are Instagram or Facebook pages, and
// "Website" is wrong for those.
export function websiteKind(url: string): 'instagram' | 'facebook' | 'website' {
  let host = ''
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return 'website'
  }
  const is = (domain: string) => host === domain || host.endsWith(`.${domain}`)
  if (is('instagram.com') || is('instagr.am')) return 'instagram'
  if (is('facebook.com') || is('fb.com') || is('fb.me')) return 'facebook'
  return 'website'
}
