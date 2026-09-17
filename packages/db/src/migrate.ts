import { lt } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db, pool } from './client'
import { authEvent, pushLog } from './schema'

// Applies generated migrations from ./drizzle against the pooled client.
// Run with: bun run --env-file=.env src/migrate.ts  (or `bun db:migrate`).
await migrate(db, { migrationsFolder: `${import.meta.dir}/../drizzle` })

// Prune the auth audit trail past its 90-day retention. It rides on migrate
// because Railway already runs this on every deploy (railway.json's
// preDeployCommand) — no cron service and no new dependency for a job that only
// needs to run occasionally. Honest caveat: it prunes only when you deploy, so
// a long quiet stretch keeps rows past 90 days until the next one.
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000
const pruned = await db
  .delete(authEvent)
  .where(lt(authEvent.createdAt, new Date(Date.now() - RETENTION_MS)))
  .returning({ id: authEvent.id })

// Prune push_log (M17) past 7 days — it's a dedupe/throttle log, not an audit
// trail, so it only needs to outlive the longest throttle window (cheers'
// hourly bucket) plus a comfortable margin, not authEvent's 90 days.
const PUSH_LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const prunedPushLog = await db
  .delete(pushLog)
  .where(lt(pushLog.sentAt, new Date(Date.now() - PUSH_LOG_RETENTION_MS)))
  .returning({ userId: pushLog.userId })

await pool.end()
console.log(
  `migrations applied${pruned.length ? ` · pruned ${pruned.length} auth events` : ''}${
    prunedPushLog.length ? ` · pruned ${prunedPushLog.length} push log rows` : ''
  }`,
)
