// Remove the fictional members the world seed invented (see lib/purgeSeedMembers.ts for exactly who
// counts), together with their rankings, dishes, notes, comments and follows. The demo account and
// every real member stay. It cannot be undone, so take a database backup first.
//
//   DATABASE_URL="<url>" bun run users:purge-seed --dry-run          # lists them, changes nothing
//   DATABASE_URL="<url>" bun run users:purge-seed --expect <count>   # the count the dry run printed
//
// The dry run does the whole delete inside a transaction and rolls it back, so the counts it prints
// are the real ones.
import { db, pool } from '@mesa/db'
import { announceDatabase } from '@mesa/db/localDatabase'

import { findSeedMembers, purgeSeedMembers } from './lib/purgeSeedMembers'

class DryRun extends Error {}

async function main() {
  announceDatabase()
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const at = args.indexOf('--expect')
  const expectRaw = at >= 0 ? Number(args[at + 1]) : Number.NaN
  if (!dryRun && !Number.isInteger(expectRaw)) {
    console.error('usage: users:purge-seed --dry-run | --expect <count from the dry run>')
    process.exit(1)
  }

  let report: Awaited<ReturnType<typeof purgeSeedMembers>> | null = null
  try {
    await db.transaction(async (tx) => {
      // A dry run has no expectation to hold it to: count first, then roll back.
      const found = (await findSeedMembers(tx)).length
      report = await purgeSeedMembers(tx, { expect: dryRun ? found : expectRaw })
      if (dryRun) throw new DryRun()
    })
  } catch (err) {
    if (!(err instanceof DryRun)) throw err
  }
  const done = report as Awaited<ReturnType<typeof purgeSeedMembers>> | null
  if (!done) return
  console.log(
    `${dryRun ? '(DRY RUN) would delete' : 'deleted'} ${done.members.length} seeded member(s):`,
  )
  for (const m of done.members) {
    console.log(`  @${m.handle ?? '—'}  ${m.name ?? ''}  (${m.ranked} ranked)`)
  }
  console.log(
    `with: ${Object.entries(done.removed)
      .map(([table, n]) => `${n} ${table}`)
      .join(', ')}`,
  )
  if (dryRun) {
    console.log(
      `\ndry run — rolled back, nothing changed. To delete: --expect ${done.members.length}`,
    )
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
