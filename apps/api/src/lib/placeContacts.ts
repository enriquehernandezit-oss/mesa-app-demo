// What counts as an invented contact detail on a restaurant row.
//
// The seed (packages/db/src/seed.ts) gives every seeded place a placeholder phone
// (+1809555XXXX) and a guessed homepage (`siteFor()`), so the reserve / call / website
// buttons had something to hit in development. Those are real businesses: a "Llamar"
// button that dials a made-up number is worse than no button. Three scripts need the same
// definition of "fake" — catalog:clean nulls them, places:audit counts them, and
// places:enrich replaces them with Google's real values — so it lives here once.

// The seed's placeholder phone: +1809555 followed by four digits.
const FAKE_PHONE = /^\+1809555\d{4}$/

// The seed's invented homepage, rebuilt per row rather than pattern-matched:
// `siteFor()` in packages/db/src/seed.ts. Matching by shape would also catch the REAL
// homepages the Google Places import brought in (bottegafratellird.com and friends), so a
// website is only a placeholder when it is character-for-character the URL the seed would
// have written for that name.
export const seedSite = (name: string): string =>
  `https://${name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '')}.do`

export function isPlaceholderPhone(phone: string | null | undefined): boolean {
  return phone != null && FAKE_PHONE.test(phone)
}

export function isPlaceholderWebsite(name: string, website: string | null | undefined): boolean {
  return website != null && website === seedSite(name)
}

// A "website" that is really a social profile — a real page the restaurant owns, so it is
// kept, but not a site: Café SBG's Google website is its Instagram. Audit-only; the app
// labels these by host itself.
const SOCIAL_HOST =
  /^https?:\/\/([a-z0-9-]+\.)*(instagram\.com|facebook\.com|fb\.com|fb\.me)(?=[/:?#]|$)/i
export function isSocialSite(website: string | null | undefined): boolean {
  return website != null && SOCIAL_HOST.test(website)
}
