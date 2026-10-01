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
// do not carry two DIFFERENT Google ids (two Google places are not duplicates). For the duplicates
// already known, `bun run places:merge-known` runs them all and skips any that are not there.
import { db, pool, schema } from '@mesa/db'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import { databaseLabel } from './lib/databaseLabel'
import { type MergeReport, mergeInto, pickSurvivor } from './lib/restaurantMerge'

const { restaurants, neighborhoods } = schema

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

export type GroupResult =
  | { kind: 'done'; kept: string; merged: number; dryRun: boolean }
  // Nothing to merge here: a name that matches no live row, or fewer than two rows.
  | { kind: 'skipped'; reason: string }

const idList = (ids: string[]) =>
  sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )

// Merge one duplicate group. Returns 'skipped' when there is nothing to merge (so a batch can go
// on to the next group) and THROWS for something wrong, such as two different Google ids.
export async function mergeGroup(
  names: string[],
  opts: { rename?: string; dryRun: boolean; log?: (line: string) => void },
): Promise<GroupResult> {
  const say = opts.log ?? console.log
  const { rename, dryRun } = opts
  const lowered = names.map((n) => n.toLowerCase())
  const rows = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      source: restaurants.source,
      googlePlaceId: restaurants.googlePlaceId,
      coverImageId: restaurants.coverImageId,
      createdAt: restaurants.createdAt,
      address: restaurants.address,
      hood: neighborhoods.name,
    })
    .from(restaurants)
    .innerJoin(neighborhoods, eq(neighborhoods.id, restaurants.neighborhoodId))
    .where(
      and(
        isNull(restaurants.removedAt),
        isNull(restaurants.closedAt),
        inArray(sql`lower(${restaurants.name})`, lowered),
      ),
    )
  const missing = names.filter((n) => !rows.some((r) => r.name.toLowerCase() === n.toLowerCase()))
  if (missing.length > 0) {
    return {
      kind: 'skipped',
      reason: `No live restaurant named ${missing.map((n) => `"${n}"`).join(', ')} — check the exact spelling.`,
    }
  }
  if (rows.length < 2) {
    return {
      kind: 'skipped',
      reason: `Found only ${rows.length} live row — a merge needs at least two.`,
    }
  }
  const googleIds = new Set(rows.map((r) => r.googlePlaceId).filter((g) => g != null))
  if (googleIds.size > 1) {
    throw new Error(
      `${names.join(' + ')}: these rows carry different Google ids, so they are different places.`,
    )
  }

  // Reviews and menu items for the whole group, one query each (hard rule 3).
  const rowIds = rows.map((r) => r.id)
  const reviewRows = await db.execute(
    sql`select restaurant_id as id, count(*)::int as n from rankings where restaurant_id in (${idList(rowIds)}) group by restaurant_id`,
  )
  const menuRows = await db.execute(
    sql`select restaurant_id as id, count(*)::int as n from menu_items where restaurant_id in (${idList(rowIds)}) group by restaurant_id`,
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

  say(`${group.length} rows are one place. ${dryRun ? '(DRY RUN)' : ''}\n`)
  for (const r of [survivor, ...losers]) {
    const bits = [
      r.source,
      // Where each row says it is — so it is plain whether two rows are really the same place.
      `${r.hood}${r.address ? `, ${r.address}` : ''}`,
      `${r.reviews} review${r.reviews === 1 ? '' : 's'}`,
      r.hasPhoto ? 'photo' : 'no photo',
      r.googlePlaceId ? 'Google id' : 'no Google id',
      r.menuItems > 0 ? `${r.menuItems} menu items` : null,
    ].filter(Boolean)
    say(`  ${r.id === survivor.id ? 'KEEP ' : 'merge'}  ${r.name}  —  ${bits.join(', ')}`)
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
    say(`\n"${name}" → "${survivor.name}"`)
    say(`  rankings carried over: ${report.rankingsMoved}`)
    if (report.rankingsMerged > 0) {
      say(
        `  members who had ranked both: ${report.rankingsMerged} (their better entry kept, list rewritten)`,
      )
    }
    if (carried.length > 0) say(`  also carried: ${carried.join(', ')}`)
    if (report.adopted.length > 0) say(`  took its facts: ${report.adopted.join(', ')}`)
  }
  if (rename) say(`\nrenamed the kept row to "${rename}"`)
  say(
    dryRun
      ? '\ndry run — rolled back, nothing changed'
      : `\ndone: ${losers.length} row(s) merged into "${rename ?? survivor.name}".`,
  )
  return { kind: 'done', kept: rename ?? survivor.name, merged: losers.length, dryRun }
}

async function main() {
  console.log(`Database: ${databaseLabel(process.env.DATABASE_URL)}`)
  const { names, rename, dryRun } = parseArgs(process.argv.slice(2))
  if (names.length === 0 || (process.argv.includes('--rename') && !rename)) {
    console.error(
      'usage: bun run places:merge "<name>" ["<name>" …] [--rename "<name>"] [--dry-run]',
    )
    process.exit(1)
  }
  const result = await mergeGroup(names, { rename, dryRun })
  if (result.kind === 'skipped') throw new Error(result.reason)
}

if (import.meta.main) {
  main()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err)
      process.exitCode = 1
    })
    .finally(() => pool.end())
}
