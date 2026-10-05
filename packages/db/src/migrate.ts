import { and, isNotNull, lt } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-postgres/migrator'

import { db, pool } from './client'
import { authEvent, authThrottle, notifications, pushLog, usageCounter } from './schema'

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

// Prune inbox rows (N1) that were read more than 180 days ago. Unread ones stay however
// old: the bell should never silently lose something the member hasn't seen.
const NOTIFICATION_RETENTION_MS = 180 * 24 * 60 * 60 * 1000
const prunedNotifications = await db
  .delete(notifications)
  .where(
    and(
      isNotNull(notifications.readAt),
      lt(notifications.createdAt, new Date(Date.now() - NOTIFICATION_RETENTION_MS)),
    ),
  )
  .returning({ id: notifications.id })

// Prune the sign-in throttle and the daily budgets once they can no longer matter: a throttle row
// forgives itself after a day, a budget window lasts a day. Without this the failed-attempt emails
// in auth_throttle were kept for good.
const DAY_MS = 24 * 60 * 60 * 1000
const prunedThrottle = await db
  .delete(authThrottle)
  .where(lt(authThrottle.lastFailureAt, new Date(Date.now() - 7 * DAY_MS)))
  .returning({ key: authThrottle.key })
const prunedBudgets = await db
  .delete(usageCounter)
  .where(lt(usageCounter.windowStart, new Date(Date.now() - 2 * DAY_MS)))
  .returning({ key: usageCounter.key })

await pool.end()
console.log(
  `migrations applied${pruned.length ? ` · pruned ${pruned.length} auth events` : ''}${
    prunedPushLog.length ? ` · pruned ${prunedPushLog.length} push log rows` : ''
  }${prunedNotifications.length ? ` · pruned ${prunedNotifications.length} notifications` : ''}${
    prunedThrottle.length ? ` · pruned ${prunedThrottle.length} sign-in throttle rows` : ''
  }${prunedBudgets.length ? ` · pruned ${prunedBudgets.length} usage budgets` : ''}`,
)
