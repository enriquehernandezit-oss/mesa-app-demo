// Mark a restaurant permanently CLOSED (sets closed_at). Never deletes: a
// closed place may already be ranked, and deleting it would cascade away
// every member's ranking of it (docs/LOCATION_CATALOG_PLAN.md, M6). A closed
// row drops out of Explore, search, trending, the rank-flow candidates and the
// public share pages; existing rankings of it stay as history.
//
//   bun run restaurant:close "Chef Pepper" --dry-run
//   DATABASE_URL="<url>" bun run restaurant:close "Chef Pepper"
//
// Matches the exact name (case-insensitive) and refuses unless exactly one
// open row matches — closing the wrong place must be impossible by accident.
// Pass --reopen to undo (clears closed_at).
import { db, pool, schema } from '@mesa/db'
import { eq, sql } from 'drizzle-orm'

const { restaurants, rankings } = schema

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const reopen = args.includes('--reopen')
  const name = args.find((a) => !a.startsWith('--'))?.trim()
  if (!name) {
    console.error('usage: bun run restaurant:close "<exact name>" [--dry-run] [--reopen]')
    process.exit(1)
  }

  const matches = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      closedAt: restaurants.closedAt,
      ranked: sql<number>`(select count(*)::int from ${rankings} where ${rankings.restaurantId} = ${restaurants.id})`,
    })
    .from(restaurants)
    .where(sql`lower(${restaurants.name}) = lower(${name})`)

  if (matches.length !== 1) {
    console.error(
      matches.length === 0
        ? `No restaurant named "${name}". Check the exact spelling.`
        : `${matches.length} restaurants are named "${name}" — refusing to guess:\n${matches
            .map((m) => `  ${m.id}  ${m.name}${m.closedAt ? '  (already closed)' : ''}`)
            .join('\n')}`,
    )
    process.exit(1)
  }

  const r = matches[0] as (typeof matches)[number]
  const verb = reopen ? 'reopen' : 'close'
  if (!reopen && r.closedAt) {
    console.log(`"${r.name}" is already closed (since ${r.closedAt.toISOString()}). Nothing to do.`)
    return
  }
  if (reopen && !r.closedAt) {
    console.log(`"${r.name}" isn't closed. Nothing to do.`)
    return
  }
  console.log(
    `${dryRun ? '(DRY RUN) would ' : ''}${verb} "${r.name}" (${r.id}) — ${r.ranked} ranking(s) keep it as history.`,
  )
  if (dryRun) return

  await db
    .update(restaurants)
    .set({ closedAt: reopen ? null : new Date() })
    .where(eq(restaurants.id, r.id))
  console.log(`done: ${verb}d.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
