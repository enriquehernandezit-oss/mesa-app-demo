import {
  checkReceipts,
  sweepDishNudges,
  sweepEventCancellations,
  sweepEventReminders,
} from './push'

// 2 minutes, not 10 (M17's original interval) — event reminders (M22) include
// an "at start" offset, and a 10-minute tick could land it up to 9 minutes
// late. The sweep itself is a handful of indexed queries, so the tighter
// interval costs nothing.
const SWEEP_INTERVAL_MS = 2 * 60 * 1000

// Starts the M17/M20/M22 background sweep: every 2 minutes, check Expo
// receipts for dead tokens, push any dish list that's crossed the ~20h due
// mark (sweepDishNudges gates its own 11:00–21:00 Santo Domingo send window,
// so most ticks in a day find nothing due there), and fire any due event
// reminder or cancellation notice. Called once from index.ts; a no-op when
// EXPO_ACCESS_TOKEN is unset (every function here returns immediately).
export function startPushSweep(): void {
  setInterval(() => {
    checkReceipts().catch((err) => console.error('push sweep failed', err))
    sweepDishNudges().catch((err) => console.error('dish nudge sweep failed', err))
    sweepEventReminders().catch((err) => console.error('event reminder sweep failed', err))
    sweepEventCancellations().catch((err) => console.error('event cancellation sweep failed', err))
  }, SWEEP_INTERVAL_MS)
}
