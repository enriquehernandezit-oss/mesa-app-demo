// Merge duplicate restaurant rows into the one worth keeping.
//
//   DATABASE_URL="<url>" bun run places:merge "<name>" ["<name>" …] [--rename "<name>"] [--dry-run]
//
// Name the rows of ONE duplicate group. A name that matches two rows (a seed row and its catalog
// twin are both called "Laurel") contributes both. The one KEPT is the row with the most reviews
// (rankings), then the one with a photo, then the oldest — and if it lacks the photo, it takes it
// from the row being dropped. Everything of the dropped rows is carried onto it, then they are
// deleted: members' rankings (a member who ranked two twins keeps their better entry, and their
// list is rewritten dense), saves, notes, dishes, list and collection entries, events, plan votes,
// the menu, and the Google id, real pin, address and contacts. See lib/restaurantMerge.ts for the
// rule for each table.
//
//   bun run places:merge "Laurel" --dry-run
//   bun run places:merge "Buche' Perico" "Buche Perico"
//   bun run places:merge "Ichiban" "Shibuya" "Shibuya Ichiban" --rename "Shibuya Ichiban"
//
// --rename gives the kept row a new name (Google calls the place "Shibuya Ichiban"; the seed rows
// were "Ichiban" and "Shibuya"). --dry-run does the whole merge inside a transaction and rolls it
// back, so the counts it prints are exactly what the real run would do. Nothing is half-merged:
// the whole group is one transaction.
//
// Refuses unless every name matches at least one live row, there are at least two rows, and they
// do not carry two DIFFERENT Google ids (two Google places are not duplicates).
import { db, pool, schema } from '@mesa/db'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import { type MergeReport, mergeInto, pickSurvivor } from './lib/restaurantMerge'

const { restaurants } = schema

export function parseArgs(argv: string[]): { names: string[]; rename?: string; dryRun: boolean } {
  const renameAt = argv.indexOf('--rename')
  const rename = renameAt >= 0 ? argv[renameAt + 1] : undefined
  const names = argv.filter((a, i) => !a.startsWith('--') && !(renameAt >= 0 && i === renameAt + 1))
  return {
    names: names.map((n) => n.trim()).filter(Boolean),
    rename,
    dryRun: argv.includes('--dry-run'),
  }
}

// Thrown after a dry run's merge to roll its transaction back.
class DryRun extends Error {}

async function main() {
  const { names, rename, dryRun } = parseArgs(process.argv.slice(2))
  if (names.length === 0 || (process.argv.includes('--rename') && !rename)) {
    console.error(
      'usage: bun run places:merge "<name>" ["<name>" …] [--rename "<name>"] [--dry-run]',
    )
    process.exit(1)
  }

  const lowered = names.map((n) => n.toLowerCase())
  const rows = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      source: restaurants.source,
      googlePlaceId: restaurants.googlePlaceId,
      coverImageId: restaurants.coverImageId,
      createdAt: restaurants.createdAt,
    })
    .from(restaurants)
    .where(
      and(
        isNull(restaurants.removedAt),
        isNull(restaurants.closedAt),
        inArray(sql`lower(${restaurants.name})`, lowered),
      ),
    )
  for (const [i, name] of lowered.entries()) {
    if (!rows.some((r) => r.name.toLowerCase() === name)) {
      throw new Error(`No live restaurant named "${names[i]}" — check the exact spelling.`)
    }
  }
  if (rows.length < 2) {
    throw new Error(`Found only ${rows.length} live row — a merge needs at least two.`)
  }
  const googleIds = new Set(rows.map((r) => r.googlePlaceId).filter((g) => g != null))
  if (googleIds.size > 1) {
    throw new Error('These rows carry different Google ids, so they are different places.')
  }

  // Reviews and menu items for the whole group, one query each (hard rule 3).
  const rowIds = rows.map((r) => r.id)
  const reviewRows = await db.execute(
    sql`select restaurant_id as id, count(*)::int as n from rankings where restaurant_id in (${sql.join(
      rowIds.map((id) => sql`${id}`),
      sql`, `,
    )}) group by restaurant_id`,
  )
  const menuRows = await db.execute(
    sql`select restaurant_id as id, count(*)::int as n from menu_items where restaurant_id in (${sql.join(
      rowIds.map((id) => sql`${id}`),
      sql`, `,
    )}) group by restaurant_id`,
  )
  const tally = (res: { rows: unknown[] }) =>
    new Map((res.rows as { id: string; n: number }[]).map((r) => [r.id, r.n]))
  const reviews = tally(reviewRows)
  const menus = tally(menuRows)

  const group = rows.map((r) => ({
    ...r,
    reviews: reviews.get(r.id) ?? 0,
    menuItems: menus.get(r.id) ?? 0,
    hasPhoto: r.coverImageId != null,
  }))
  const survivor = pickSurvivor(group)
  const losers = group.filter((r) => r.id !== survivor.id)

  console.log(`${group.length} rows are one place. ${dryRun ? '(DRY RUN)' : ''}\n`)
  for (const r of [survivor, ...losers]) {
    const bits = [
      r.source,
      `${r.reviews} review${r.reviews === 1 ? '' : 's'}`,
      r.hasPhoto ? 'photo' : 'no photo',
      r.googlePlaceId ? 'Google id' : 'no Google id',
      r.menuItems > 0 ? `${r.menuItems} menu items` : null,
    ].filter(Boolean)
    console.log(`  ${r.id === survivor.id ? 'KEEP ' : 'merge'}  ${r.name}  —  ${bits.join(', ')}`)
  }

  const reports: { name: string; report: MergeReport }[] = []
  try {
    await db.transaction(async (tx) => {
      for (const loser of losers) {
        reports.push({ name: loser.name, report: await mergeInto(tx, survivor.id, loser.id) })
      }
      if (rename) {
        await tx.update(restaurants).set({ name: rename }).where(eq(restaurants.id, survivor.id))
      }
      if (dryRun) throw new DryRun()
    })
  } catch (err) {
    if (!(err instanceof DryRun)) throw err
  }

  for (const { name, report } of reports) {
    const carried = Object.entries(report.moved)
      .filter(([, n]) => n > 0)
      .map(([table, n]) => `${n} ${table.replace(/_/g, ' ')}`)
    console.log(`\n"${name}" → "${survivor.name}"`)
    console.log(`  rankings carried over: ${report.rankingsMoved}`)
    if (report.rankingsMerged > 0) {
      console.log(
        `  members who had ranked both: ${report.rankingsMerged} (their better entry kept, list rewritten)`,
      )
    }
    if (carried.length > 0) console.log(`  also carried: ${carried.join(', ')}`)
    if (report.adopted.length > 0) console.log(`  took its facts: ${report.adopted.join(', ')}`)
  }
  if (rename) console.log(`\nrenamed the kept row to "${rename}"`)
  console.log(
    dryRun
      ? '\ndry run — rolled back, nothing changed'
      : `\ndone: ${losers.length} row(s) merged into "${rename ?? survivor.name}".`,
  )
}

if (import.meta.main) {
  main()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err)
      process.exitCode = 1
    })
    .finally(() => pool.end())
}
