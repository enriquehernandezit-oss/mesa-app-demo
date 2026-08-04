import { pgEnum } from 'drizzle-orm/pg-core'

// What a report can point at. Vibe notes are the only UGC in Phase 1; users can
// also be reported directly (App Store 1.2).
export const reportTargetType = pgEnum('report_target_type', ['vibe_note', 'user'])

// Moderation lifecycle for a report.
export const reportStatus = pgEnum('report_status', ['open', 'reviewing', 'actioned', 'dismissed'])
