// Clear invented contact details from the catalog.
//
// The seed gives every seeded restaurant a placeholder phone (+1809555XXXX) and
// a guessed homepage (`siteFor()` in packages/db/src/seed.ts) so the reserve /
// call / website buttons have something to hit in development. Those are real
// businesses with real customers: once the app is on a stranger's phone, a
// "Llamar" button that dials a made-up number — or a "Sitio web" that opens a
// domain the restaurant doesn't own — is worse than no button at all. The UI
// already hides each action when its field is null (r/[restaurantId].tsx), so
// nulling them is the correct end state until someone verifies the real ones.
//
//   bun run catalog:clean --dry-run
//   DATABASE_URL="<url>" bun run catalog:clean
//
// Only touches the two tells: the seed's placeholder phone shape, and a website
// that is exactly the URL the seed would generate. Anything else is left alone.
import { db, pool, schema } from '@mesa/db'
import { inArray } from 'drizzle-orm'

const { restaurants } = schema

// The seed's placeholder phone: +1809555 followed by four digits.
const FAKE_PHONE = /^\+1809555\d{4}$/
// The seed's invented homepage, rebuilt per row rather than pattern-matched:
// `siteFor()` in packages/db/src/seed.ts. Matching by shape would also catch the
// REAL homepages the Google Places import brought in (bottegafratellird.com and
// friends), which must survive untouched — so a website is only cleared when it
// is character-for-character the URL the seed would have written for that name.
const seedSite = (name: string) =>
  `https://${name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '')}.do`

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const all = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      phone: restaurants.phone,
      website: restaurants.website,
    })
    .from(restaurants)
    .orderBy(restaurants.name)

  const badPhones = all.filter((r) => r.phone && FAKE_PHONE.test(r.phone))
  const badSites = all.filter((r) => r.website && r.website === seedSite(r.name))
  const touched = new Set([...badPhones, ...badSites].map((r) => r.id))

  if (touched.size === 0) {
    console.log('Nothing to clean — no placeholder phones or websites found.')
    return
  }

  console.log(
    `${dryRun ? '(DRY RUN) would clear ' : 'clearing '}${badPhones.length} phone(s) and ` +
      `${badSites.length} website(s) across ${touched.size} restaurant(s):`,
  )
  for (const r of all.filter((x) => touched.has(x.id))) {
    const bits = [
      badPhones.includes(r) ? `phone ${r.phone}` : null,
      badSites.includes(r) ? `site ${r.website}` : null,
    ]
      .filter(Boolean)
      .join(', ')
    console.log(`  ${r.name} — ${bits}`)
  }
  const keptSites = all.filter((r) => r.website && r.website !== seedSite(r.name)).length
  console.log(`(${keptSites} website(s) look real and are left alone.)`)
  if (dryRun) return

  if (badPhones.length > 0) {
    await db
      .update(restaurants)
      .set({ phone: null })
      .where(
        inArray(
          restaurants.id,
          badPhones.map((r) => r.id),
        ),
      )
  }
  if (badSites.length > 0) {
    await db
      .update(restaurants)
      .set({ website: null })
      .where(
        inArray(
          restaurants.id,
          badSites.map((r) => r.id),
        ),
      )
  }
  console.log('done: cleared.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
