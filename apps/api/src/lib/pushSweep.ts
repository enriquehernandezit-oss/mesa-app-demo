import { checkReceipts } from './push'

const SWEEP_INTERVAL_MS = 10 * 60 * 1000

// Starts the M17 background sweep: every 10 minutes, check Expo receipts for
// dead tokens. (Due dish nudges join this sweep in M20, once dish_lists
// exists — see push.ts's header for why the ticket queue this drains is
// in-process rather than a table.) Called once from index.ts; a no-op when
// EXPO_ACCESS_TOKEN is unset (checkReceipts itself returns immediately).
export function startPushSweep(): void {
  setInterval(() => {
    checkReceipts().catch((err) => console.error('push sweep failed', err))
  }, SWEEP_INTERVAL_MS)
}
