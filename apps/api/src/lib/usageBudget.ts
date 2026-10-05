import { db, schema } from '@mesa/db'
import { sql } from 'drizzle-orm'

const { usageCounter } = schema

// A durable daily budget: how much of some kind of work one member may do in a day. Counted in
// Postgres (usage_counter), not in process memory, so a deploy — which happens on every push —
// does not hand everyone a fresh allowance, and two instances share one count.
//
// The window is a day from the first spend, then restarts. One atomic upsert; the amount is added
// even when it takes the total over the limit, so repeated tries cannot creep under it.
const WINDOW_MS = 24 * 60 * 60 * 1000

// True when `amount` fits in the day's budget (and is spent), false when it would not.
export async function spendBudget(key: string, amount: number, limit: number): Promise<boolean> {
  const now = new Date()
  const edge = new Date(now.getTime() - WINDOW_MS)
  const [row] = await db
    .insert(usageCounter)
    .values({ key, used: amount, windowStart: now })
    .onConflictDoUpdate({
      target: usageCounter.key,
      set: {
        used: sql`case when ${usageCounter.windowStart} < ${edge} then ${amount} else ${usageCounter.used} + ${amount} end`,
        windowStart: sql`case when ${usageCounter.windowStart} < ${edge} then ${now} else ${usageCounter.windowStart} end`,
      },
    })
    .returning({ used: usageCounter.used })
  return (row?.used ?? amount) <= limit
}

// Contact and Instagram matching are phone-to-identity and handle-to-identity lookups: a script
// that can probe without limit can learn who owns which number. One shared daily budget per member
// across all three endpoints that do it, sized for a couple of full address books.
export const MATCH_DAILY_LIMIT = 5000
export const matchBudgetKey = (userId: string) => `match:${userId}`
export const spendMatchBudget = (userId: string, count: number) =>
  spendBudget(matchBudgetKey(userId), count, MATCH_DAILY_LIMIT)
