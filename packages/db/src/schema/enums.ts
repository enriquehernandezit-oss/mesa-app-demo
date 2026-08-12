import { pgEnum } from 'drizzle-orm/pg-core'

// What a report can point at. Vibe notes and dish posts are the UGC; users can
// also be reported directly (App Store 1.2).
export const reportTargetType = pgEnum('report_target_type', ['vibe_note', 'user', 'dish'])

// Moderation lifecycle for a report.
export const reportStatus = pgEnum('report_status', ['open', 'reviewing', 'actioned', 'dismissed'])
