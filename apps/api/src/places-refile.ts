// Re-file places into Santo Domingo's sectors by the sector name Google gave them
// (restaurants.google_sublocality, filled by places:enrich and the 30-day refresh) — no Google calls.
// Run after new sectors are added (migration 0040) and after places:enrich has filled the column.
//
//   DATABASE_URL="<url>" bun run places:refile [--dry-run]
//
// Always --dry-run first. A place with no Google sector name, or one no sector claims, is left where it
// is — and the names nobody claims are listed, since they are the sectors worth adding next.
import { db, pool, schema } from '@mesa/db'
import { and, eq, isNull } from 'drizzle-orm'

import { databaseLabel } from './lib/databaseLabel'
import { type RefileRow, planRefile } from './lib/refile'

const { restaurants, neighborhoods } = schema

async function main() {
  console.log(`Database: ${databaseLabel(process.env.DATABASE_URL)}`)
  const dryRun = process.argv.includes('--dry-run')

  const sectors = await db
    .select({ id: neighborhoods.id, name: neighborhoods.name, aliases: neighborhoods.aliases })
    .from(neighborhoods)
    .where(eq(neighborhoods.listed, true))
  const hoodName = new Map(
    (await db.select({ id: neighborhoods.id, name: neighborhoods.name }).from(neighborhoods)).map(
      (h) => [h.id, h.name],
    ),
  )
  const sectorIds = new Set(sectors.map((s) => s.id))

  // Only places that are live and already under a listed sector (a place filed under another city's
  // area is not Santo Domingo's to move).
  const rows: RefileRow[] = (
    await db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        neighborhoodId: restaurants.neighborhoodId,
        googleSublocality: restaurants.googleSublocality,
      })
      .from(restaurants)
      .where(and(isNull(restaurants.removedAt), isNull(restaurants.closedAt)))
  ).filter((r) => sectorIds.has(r.neighborhoodId))

  const { moves, unmatched } = planRefile(rows, sectors)
  console.log(
    `${dryRun ? '(DRY RUN) ' : ''}${rows.length} place(s) checked, ${moves.length} to move`,
  )
  for (const { row, to } of moves) {
    console.log(`  ${row.name}: ${hoodName.get(row.neighborhoodId) ?? '—'} → ${to.name}`)
  }
  if (unmatched.size > 0) {
    console.log('\nGoogle sector names no sector claims (left alone) — candidates to add:')
    for (const [name, n] of [...unmatched].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${name}  (${n})`)
    }
  }
  if (dryRun) return console.log('\ndry run — no writes')
  for (const { row, to } of moves) {
    await db.update(restaurants).set({ neighborhoodId: to.id }).where(eq(restaurants.id, row.id))
  }
  console.log(`\ndone: ${moves.length} place(s) moved.`)
}

if (import.meta.main) {
  main()
    .catch((err) => {
      console.error(err)
      process.exitCode = 1
    })
    .finally(() => pool.end())
}
