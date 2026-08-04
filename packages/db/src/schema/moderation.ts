import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { reportStatus, reportTargetType } from './enums'

// UGC moderation (App Store 1.2). A report points at a vibe note or a user.
// targetId is kept as text so it can hold either a note uuid or a user id
// without two nullable FK columns. The reporter cascades on account deletion;
// the report itself is retained (status history) rather than FK-linked to the
// target, since the target may be removed as part of moderation.
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterId: text('reporter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    targetType: reportTargetType('target_type').notNull(),
    targetId: text('target_id').notNull(),
    reason: text('reason').notNull(),
    status: reportStatus('status').notNull().default('open'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('reports_status_idx').on(t.status),
    index('reports_target_idx').on(t.targetType, t.targetId),
  ],
)
