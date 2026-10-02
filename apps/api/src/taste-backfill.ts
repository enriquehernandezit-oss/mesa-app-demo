// Silently records every pair of people who ALREADY match at TASTE_PUSH_AT or more, so the
// taste_match notification only ever fires for a match that crosses the line from now on — not
// for the whole history the first time anyone ranks something after the feature ships.
//
//   bun run --filter @mesa/api taste:backfill [--dry-run]
//
// Idempotent (the inbox's unique key). Writes inbox rows already marked read and sends NO push.
// Run it once against production right after the API that has the feature deploys.
import { db, pool, schema } from '@mesa/db'

import { databaseLabel } from './lib/databaseLabel'
import { tastePairs, tasteInputs } from './lib/friendSignals'

const dryRun = process.argv.includes('--dry-run')

console.log(`Database: ${databaseLabel(process.env.DATABASE_URL)}`)
const inputs = tasteInputs(await tastePairs())
console.log(`${inputs.length} pair(s) already at the match line.`)

if (!dryRun && inputs.length > 0) {
  const now = new Date()
  let written = 0
  for (let i = 0; i < inputs.length; i += 500) {
    const rows = await db
      .insert(schema.notifications)
      .values(
        inputs.slice(i, i + 500).map((n) => ({
          userId: n.userId,
          kind: n.kind,
          dedupeKey: n.dedupeKey,
          actorId: n.actorId ?? null,
          data: n.data ?? null,
          readAt: now,
        })),
      )
      .onConflictDoNothing({
        target: [schema.notifications.userId, schema.notifications.dedupeKey],
      })
      .returning({ id: schema.notifications.id })
    written += rows.length
  }
  console.log(`Recorded ${written} (the rest were already there). No push was sent.`)
} else if (dryRun) {
  console.log('Dry run: nothing written.')
}
await pool.end()
