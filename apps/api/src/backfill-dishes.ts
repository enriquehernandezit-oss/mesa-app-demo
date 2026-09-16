// Two-part, idempotent backfill for the M11 dish-categories migration (0015):
//
//   1. Every existing `dishes` row missing a category gets one guessed from
//      its name (packages/db/src/dishCategories.ts's keyword matcher).
//   2. Every `rankings.favoriteDish` string that doesn't already have a
//      matching dish row becomes a new, photo-less `dishes` row — this is
//      the actual migration of the old free-text field into the entity.
//
//   DATABASE_URL="<url>" bun run backfill:dishes [--dry-run]
//
// Always --dry-run first and read the counts before a real run. Re-running
// is safe: part 1 only ever touches rows still missing a category, and part
// 2's anti-join (on rankingId + nameKey) means a dish already backfilled is
// never inserted twice — so this can also be re-run later if an old client
// ever writes a new favoriteDish string (it can't as of this migration, but
// the check costs nothing).
//
// A separate mode, unrelated to the migration above:
//
//   DATABASE_URL="<url>" bun run backfill:dishes --recategorize-otro [--dry-run]
//
// M13 substantially expanded the keyword database (packages/db/src/dishes-audit.ts
// has the real-menu-data audit that drove it). This re-guesses every LIVE
// dish still sitting in 'otro' and only writes the ones whose new guess is
// no longer 'otro' — so it's a no-op the moment nothing's left to improve,
// safe to re-run after any future taxonomy change.
import { DISH_CATEGORIES, db, guessDishCategory, pool, schema } from '@mesa/db'
import { and, eq, isNull, sql } from 'drizzle-orm'

const { dishes, rankings } = schema
const CHUNK = 500

async function backfillExistingCategories(dryRun: boolean): Promise<{
  updated: number
  distribution: Map<string, number>
}> {
  const rows = await db
    .select({ id: dishes.id, name: dishes.name })
    .from(dishes)
    .where(isNull(dishes.categoryId))

  const distribution = new Map<string, number>()
  const guesses = rows.map((r) => {
    const categoryId = guessDishCategory(r.name)
    distribution.set(categoryId, (distribution.get(categoryId) ?? 0) + 1)
    return { id: r.id, categoryId }
  })

  if (!dryRun) {
    for (let i = 0; i < guesses.length; i += CHUNK) {
      const chunk = guesses.slice(i, i + CHUNK)
      if (chunk.length === 0) continue
      const params = chunk.flatMap((g) => [g.id, g.categoryId])
      const valuesList = chunk.map((_, j) => `($${j * 2 + 1}::uuid, $${j * 2 + 2})`).join(', ')
      await pool.query(
        `update dishes set category_id = v.cat, updated_at = now()
         from (values ${valuesList}) as v(id, cat)
         where dishes.id = v.id`,
        params,
      )
    }
  }

  return { updated: rows.length, distribution }
}

async function backfillFavoriteDish(dryRun: boolean): Promise<{
  created: number
  distribution: Map<string, number>
  toOtro: Map<string, number>
}> {
  // Anti-join: a ranking with a non-empty favoriteDish that doesn't already
  // have a matching dish row (same ranking, same normalized name, not
  // removed) — matches the same rule POST /dishes uses for its own upsert.
  const candidates = await db
    .select({
      rankingId: rankings.id,
      userId: rankings.userId,
      restaurantId: rankings.restaurantId,
      favoriteDish: rankings.favoriteDish,
    })
    .from(rankings)
    .leftJoin(
      dishes,
      and(
        eq(dishes.rankingId, rankings.id),
        eq(dishes.nameKey, sql<string>`mesa_norm(${rankings.favoriteDish})`),
        isNull(dishes.removedAt),
      ),
    )
    .where(and(sql`coalesce(${rankings.favoriteDish}, '') <> ''`, isNull(dishes.id)))

  const distribution = new Map<string, number>()
  const toOtro = new Map<string, number>()
  const toInsert = candidates
    .filter((c): c is typeof c & { favoriteDish: string } => Boolean(c.favoriteDish?.trim()))
    .map((c) => {
      const name = c.favoriteDish.trim()
      const categoryId = guessDishCategory(name)
      distribution.set(categoryId, (distribution.get(categoryId) ?? 0) + 1)
      if (categoryId === 'otro') toOtro.set(name, (toOtro.get(name) ?? 0) + 1)
      return {
        userId: c.userId,
        rankingId: c.rankingId,
        restaurantId: c.restaurantId,
        name,
        categoryId,
      }
    })

  if (!dryRun) {
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK)
      if (chunk.length === 0) continue
      await db.insert(dishes).values(
        chunk.map((c) => ({
          userId: c.userId,
          rankingId: c.rankingId,
          restaurantId: c.restaurantId,
          name: c.name,
          imageId: null,
          categoryId: c.categoryId,
        })),
      )
    }
  }

  return { created: toInsert.length, distribution, toOtro }
}

async function recategorizeOtro(dryRun: boolean): Promise<{
  updated: number
  stillOtro: number
  distribution: Map<string, number>
}> {
  const rows = await db
    .select({ id: dishes.id, name: dishes.name })
    .from(dishes)
    .where(and(eq(dishes.categoryId, 'otro'), isNull(dishes.removedAt)))

  const distribution = new Map<string, number>()
  const toUpdate = rows
    .map((r) => ({ id: r.id, categoryId: guessDishCategory(r.name) }))
    .filter((g) => g.categoryId !== 'otro')
  for (const g of toUpdate)
    distribution.set(g.categoryId, (distribution.get(g.categoryId) ?? 0) + 1)

  if (!dryRun) {
    for (let i = 0; i < toUpdate.length; i += CHUNK) {
      const chunk = toUpdate.slice(i, i + CHUNK)
      if (chunk.length === 0) continue
      const params = chunk.flatMap((g) => [g.id, g.categoryId])
      const valuesList = chunk.map((_, j) => `($${j * 2 + 1}::uuid, $${j * 2 + 2})`).join(', ')
      await pool.query(
        `update dishes set category_id = v.cat, updated_at = now()
         from (values ${valuesList}) as v(id, cat)
         where dishes.id = v.id`,
        params,
      )
    }
  }

  return { updated: toUpdate.length, stillOtro: rows.length - toUpdate.length, distribution }
}

function printDistribution(dist: Map<string, number>): void {
  const known = new Set(DISH_CATEGORIES.map((c) => c.id))
  const sorted = [...dist.entries()].sort((a, b) => b[1] - a[1])
  for (const [categoryId, count] of sorted) {
    const flag = known.has(categoryId) ? '' : ' (unknown category id!)'
    console.log(`    ${categoryId}: ${count}${flag}`)
  }
}

async function run(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  const recategorize = process.argv.includes('--recategorize-otro')

  if (recategorize) {
    console.log(`backfill:dishes --recategorize-otro ${dryRun ? '(DRY RUN)' : ''}`)
    console.log('='.repeat(40))
    const result = await recategorizeOtro(dryRun)
    console.log(
      `\nRe-guessed ${result.updated} 'otro' dish(es) into a real category (${result.stillOtro} still 'otro').`,
    )
    console.log('  new category distribution:')
    printDistribution(result.distribution)
    console.log(`\n${'='.repeat(40)}`)
    console.log(dryRun ? 'Dry run — nothing written. Re-run without --dry-run to apply.' : 'Done.')
    await pool.end()
    return
  }

  console.log(`backfill:dishes ${dryRun ? '(DRY RUN)' : ''}`)
  console.log('='.repeat(40))

  const part1 = await backfillExistingCategories(dryRun)
  console.log(`\n1. Existing dishes missing a category: ${part1.updated}`)
  console.log('  category distribution:')
  printDistribution(part1.distribution)

  const part2 = await backfillFavoriteDish(dryRun)
  console.log(`\n2. favoriteDish strings backfilled into dishes: ${part2.created}`)
  console.log('  category distribution:')
  printDistribution(part2.distribution)

  const topOtro = [...part2.toOtro.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
  if (topOtro.length > 0) {
    console.log(`\n  top ${topOtro.length} names that fell to 'otro':`)
    for (const [name, count] of topOtro) console.log(`    ${name}: ${count}`)
  }

  console.log(`\n${'='.repeat(40)}`)
  console.log(dryRun ? 'Dry run — nothing written. Re-run without --dry-run to apply.' : 'Done.')

  await pool.end()
}

if (import.meta.main) {
  run().catch(async (err) => {
    console.error(err)
    await pool.end()
    process.exit(1)
  })
}
