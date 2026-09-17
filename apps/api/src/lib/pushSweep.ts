import { checkReceipts, sweepDishNudges } from './push'

const SWEEP_INTERVAL_MS = 10 * 60 * 1000

// Starts the M17/M20 background sweep: every 10 minutes, check Expo receipts
// for dead tokens and push any dish list that's crossed the ~20h due mark
// (sweepDishNudges gates its own 11:00–21:00 Santo Domingo send window, so
// most ticks in a day find nothing due there). Called once from index.ts; a
// no-op when EXPO_ACCESS_TOKEN is unset (both functions return immediately).
export function startPushSweep(): void {
  setInterval(() => {
    checkReceipts().catch((err) => console.error('push sweep failed', err))
    sweepDishNudges().catch((err) => console.error('dish nudge sweep failed', err))
  }, SWEEP_INTERVAL_MS)
}
