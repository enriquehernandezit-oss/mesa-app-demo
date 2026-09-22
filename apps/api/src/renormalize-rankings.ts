// Fixes ranking-integrity violations (see check-rankings.ts) by re-densifying
// every user's list: position 1..n in their existing relative order, score
// recomputed from the ONE formula (scoreFor). Idempotent — a user whose list
// is already correct is left untouched (no write, not even an updatedAt
// bump), so re-running this after it's already fixed everything is a no-op.
//
//   DATABASE_URL="<url>" bun run rankings:renormalize [--dry-run]
//
// Always --dry-run first and read the report before a real run.
import { db, pool, schema, scoreFor } from '@mesa/db'
import { asc, eq } from 'drizzle-orm'

import { lockUserList, rewrite } from './lib/rankingOrder'

const { rankings } = schema

async function run(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')

  const userIds = await db
    .selectDistinct({ userId: rankings.userId })
    .from(rankings)
    .then((rows) => rows.map((r) => r.userId))

  let touched = 0
  let rowsChanged = 0

  for (const userId of userIds) {
    // Ties on position (a symptom of exactly the corruption this fixes)
    // break on updatedAt then id, so the result is deterministic and stable
    // across repeated runs on the same corrupted data.
    const rows = await db
      .select({
        restaurantId: rankings.restaurantId,
        position: rankings.position,
        score: rankings.score,
      })
      .from(rankings)
      .where(eq(rankings.userId, userId))
      .orderBy(asc(rankings.position), asc(rankings.updatedAt), asc(rankings.id))

    const total = rows.length
    const needsFix = rows.some((r, i) => r.position !== i + 1 || r.score !== scoreFor(i, total))
    if (!needsFix) continue

    touched++
    rowsChanged += total
    console.log(
      `${dryRun ? '[dry run] ' : ''}user ${userId}: ${total} ranking(s) renumbered/rescored`,
    )

    if (!dryRun) {
      const orderedIds = rows.map((r) => r.restaurantId)
      await db.transaction(async (tx) => {
        await lockUserList(tx, userId)
        await rewrite(tx, userId, orderedIds)
      })
    }
  }

  console.log(`\nrenormalize report\n${'='.repeat(40)}`)
  console.log(`users checked:  ${userIds.length}`)
  console.log(`users touched:  ${touched}`)
  console.log(
    `rows rewritten: ${dryRun ? 0 : rowsChanged} ${dryRun ? '(dry run — 0 written)' : ''}`,
  )
  console.log('='.repeat(40))

  await pool.end()
}

if (import.meta.main) {
  run().catch(async (err) => {
    console.error(err)
    await pool.end()
    process.exit(1)
  })
}
