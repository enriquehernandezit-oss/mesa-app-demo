// Delete one restaurant that should never have been in Mesa (a bookstore Google matched by name).
//
//   DATABASE_URL="<url>" bun run places:remove "<exact name>" [--dry-run] [--force]
//
// Unlike restaurant:close, which only hides a place that closed, this DELETES the row and
// everything attached to it (menu, dishes, saves, list entries, events, notifications…). Members'
// rankings of it go too, and each affected member's list is rewritten dense so it has no hole —
// which is why it refuses, without --force, when anyone has ranked the place. Plans that had
// chosen it just lose the reference.
//
// Matches the exact name (case-insensitive) and refuses unless exactly one live row matches, so
// removing the wrong place is not possible by accident. --dry-run does the whole delete inside a
// transaction and rolls it back, printing what it would remove.
import { db, pool, schema } from '@mesa/db'
import { and, isNull, sql } from 'drizzle-orm'

import { removeRestaurant } from './lib/restaurantMerge'

const { restaurants } = schema

class DryRun extends Error {}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const force = args.includes('--force')
  const name = args.find((a) => !a.startsWith('--'))?.trim()
  if (!name) {
    console.error('usage: bun run places:remove "<exact name>" [--dry-run] [--force]')
    process.exit(1)
  }

  const matches = await db
    .select({ id: restaurants.id, name: restaurants.name, source: restaurants.source })
    .from(restaurants)
    .where(
      and(isNull(restaurants.removedAt), sql`lower(${restaurants.name}) = ${name.toLowerCase()}`),
    )
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `No restaurant named "${name}" — check the exact spelling.`
        : `${matches.length} restaurants are named "${name}"; refusing to guess which to delete.`,
    )
  }
  const target = matches[0]
  if (!target) throw new Error('unreachable')

  let removed: Record<string, number> = {}
  try {
    await db.transaction(async (tx) => {
      const report = await removeRestaurant(tx, target.id)
      removed = report.removed
      if ((removed.rankings ?? 0) > 0 && !force) {
        // Throw so the transaction rolls back before anything is committed.
        throw new Error(
          `${removed.rankings} member(s) have ranked "${target.name}". Re-run with --force to delete their rankings too.`,
        )
      }
      if (dryRun) throw new DryRun()
    })
  } catch (err) {
    if (!(err instanceof DryRun)) throw err
  }

  const attached = Object.entries(removed)
    .filter(([, n]) => n > 0)
    .map(([table, n]) => `${n} ${table.replace(/_/g, ' ')}`)
  console.log(
    `${dryRun ? '(DRY RUN) would delete' : 'deleted'} "${target.name}" (${target.source})`,
  )
  console.log(
    attached.length > 0 ? `  with: ${attached.join(', ')}` : '  nothing was attached to it',
  )
  if (dryRun) console.log('\ndry run — rolled back, nothing changed')
}

if (import.meta.main) {
  main()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err)
      process.exitCode = 1
    })
    .finally(() => pool.end())
}
