// Importer for Mesa-curated events (M21) — see docs/EVENTS.md for the full
// runbook. Much smaller than import-top100.ts since there's no geocoding:
// every event just needs an exact-name match against a restaurant that
// already exists in the catalog (never invented, never fuzzy — a slightly
// wrong match here would attach a real event to the wrong real place). The
// same posture as every other importer in this file's family:
//
//   • upserts by `slug`, NEVER deletes — an RSVP or a planes-prefill link
//     could point at a row this run doesn't see anymore. An event that's off
//     the calendar gets `cancelledAt` set by hand (see docs/EVENTS.md),
//     never removed here.
//   • the whole restaurant catalog is loaded ONCE and matched in memory
//     (CLAUDE.md rule 3) — trivial at this scale (a JSON file of a few dozen
//     events at most, matched against a few hundred restaurants).
//   • always --dry-run first and read the printed match report.
//
// Source: apps/api/data/events.json, `{ events: [{ slug, restaurantName,
// title, description, startsAt, endsAt, category, priceLabel, ticketUrl,
// coverImageId, capacity, bookingWhatsapp }] }` — startsAt/endsAt are ISO strings with an explicit
// offset (e.g. "2026-09-17T20:30:00-04:00") so they parse the same instant
// regardless of the machine running this script.
//
//   DATABASE_URL="<url>" bun run src/import-events.ts [--dry-run]

import { readFileSync } from 'node:fs'
import { db, pool, schema } from '@mesa/db'
import { eq } from 'drizzle-orm'

const { events, restaurants } = schema

interface EventInput {
  slug: string
  restaurantName: string
  title: string
  description?: string
  startsAt: string
  endsAt?: string
  category?: string
  priceLabel?: string
  ticketUrl?: string
  coverImageId?: string
  capacity?: number
  bookingWhatsapp?: string
}

// Validates and normalizes the two optional booking fields — `null` for an
// omitted one (an update then clears it, same as every other optional field
// here). A number is accepted with spaces/dashes/'+' ("+1 809-555-1234") and
// stored as bare digits, the form a wa.me link takes.
export function bookingFields(
  e: Pick<EventInput, 'capacity' | 'bookingWhatsapp'>,
): { capacity: number | null; bookingWhatsapp: string | null } | { error: string } {
  const { capacity, bookingWhatsapp } = e
  if (
    capacity !== undefined &&
    !(Number.isInteger(capacity) && capacity > 0 && capacity <= 10000)
  ) {
    return { error: `capacity must be an integer 1–10000 (got ${JSON.stringify(capacity)})` }
  }
  let digits: string | null = null
  if (bookingWhatsapp !== undefined) {
    digits = typeof bookingWhatsapp === 'string' ? bookingWhatsapp.replace(/[\s\-+]/g, '') : ''
    if (!/^\d{8,15}$/.test(digits)) {
      return {
        error: `bookingWhatsapp must be 8–15 digits, E.164 without '+' (got ${JSON.stringify(bookingWhatsapp)})`,
      }
    }
  }
  return { capacity: capacity ?? null, bookingWhatsapp: digits }
}

async function run() {
  const dryRun = process.argv.includes('--dry-run')

  const raw = readFileSync(new URL('../data/events.json', import.meta.url), 'utf-8')
  const data = JSON.parse(raw) as { events: EventInput[] }

  const catalog = await db.select({ id: restaurants.id, name: restaurants.name }).from(restaurants)
  const restaurantIdByName = new Map(catalog.map((r) => [r.name, r.id]))

  const existing = await db.select({ slug: events.slug }).from(events)
  const existingSlugs = new Set(existing.map((e) => e.slug))

  const unmatched: string[] = []
  const invalid: string[] = []
  type Row = Omit<EventInput, 'capacity' | 'bookingWhatsapp'> & {
    restaurantId: string
    capacity: number | null
    bookingWhatsapp: string | null
  }
  const toInsert: Row[] = []
  const toUpdate: Row[] = []

  for (const e of data.events) {
    const booking = bookingFields(e)
    if ('error' in booking) {
      invalid.push(`${e.slug} → ${booking.error}`)
      continue
    }
    const restaurantId = restaurantIdByName.get(e.restaurantName)
    if (!restaurantId) {
      unmatched.push(`${e.slug} → "${e.restaurantName}" (no exact match in catalog)`)
      continue
    }
    ;(existingSlugs.has(e.slug) ? toUpdate : toInsert).push({ ...e, ...booking, restaurantId })
  }

  console.log(
    `events import ${dryRun ? '(DRY RUN)' : ''}: ` +
      `${data.events.length} in source · ${toInsert.length} new · ` +
      `${toUpdate.length} matched (update) · ${unmatched.length} unmatched restaurant · ` +
      `${invalid.length} invalid`,
  )
  if (unmatched.length) {
    console.log('  unmatched:')
    for (const line of unmatched) console.log(`    ${line}`)
  }
  if (invalid.length) {
    console.log('  invalid (skipped):')
    for (const line of invalid) console.log(`    ${line}`)
  }

  if (dryRun) {
    console.log('  dry run — no writes')
    await pool.end()
    return
  }

  for (const e of toInsert) {
    await db.insert(events).values({
      slug: e.slug,
      restaurantId: e.restaurantId,
      title: e.title,
      description: e.description ?? null,
      startsAt: new Date(e.startsAt),
      endsAt: e.endsAt ? new Date(e.endsAt) : null,
      category: e.category ?? null,
      priceLabel: e.priceLabel ?? null,
      ticketUrl: e.ticketUrl ?? null,
      coverImageId: e.coverImageId ?? null,
      capacity: e.capacity,
      bookingWhatsapp: e.bookingWhatsapp,
    })
  }
  for (const e of toUpdate) {
    await db
      .update(events)
      .set({
        restaurantId: e.restaurantId,
        title: e.title,
        description: e.description ?? null,
        startsAt: new Date(e.startsAt),
        endsAt: e.endsAt ? new Date(e.endsAt) : null,
        category: e.category ?? null,
        priceLabel: e.priceLabel ?? null,
        ticketUrl: e.ticketUrl ?? null,
        coverImageId: e.coverImageId ?? null,
        capacity: e.capacity,
        bookingWhatsapp: e.bookingWhatsapp,
        updatedAt: new Date(),
      })
      .where(eq(events.slug, e.slug))
  }

  console.log(`  wrote ${toInsert.length} new, updated ${toUpdate.length}`)
  await pool.end()
}

// Guarded the same way import-top100.ts is, so import-events.test.ts can
// import bookingFields without a live run.
if (import.meta.main) {
  run().catch(async (err) => {
    console.error(err)
    await pool.end()
    process.exit(1)
  })
}
