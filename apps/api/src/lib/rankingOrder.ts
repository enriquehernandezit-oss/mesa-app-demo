import { type db, schema, scoreFor } from '@mesa/db'
import { asc, eq, sql } from 'drizzle-orm'

const { rankings } = schema

// The transaction executor type, so helpers can run against either db or an
// open transaction without an unsafe cast.
export type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0]

// Serializes writes to one user's ranked list for the lifetime of the
// transaction (released automatically at commit/rollback). Without this, two
// concurrent POSTs both read the same `currentOrder` snapshot and can each
// write position 1 — the schema deliberately has no unique(userId, position)
// to enforce this at the DB level, so the lock is the only thing that does.
// `hashtext` collapses the uuid to an int4 for pg_advisory_xact_lock's key;
// collisions across users are irrelevant here since a false serialization
// only costs a lock wait, never incorrect data.
export async function lockUserList(tx: Executor, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`)
}

// Read the user's current order as restaurantIds, best-first. Takes the executor
// (db or an open transaction) so callers inside a tx see in-flight state. Small
// list, so a full read is cheap.
export async function currentOrder(exec: Executor, userId: string): Promise<string[]> {
  const rows = await exec
    .select({ restaurantId: rankings.restaurantId })
    .from(rankings)
    .where(eq(rankings.userId, userId))
    .orderBy(asc(rankings.position))
  return rows.map((r) => r.restaurantId)
}

// Rewrite the whole list's positions (dense 1..n) and derived scores in one
// upsert. The list is per-user and small, so a full rewrite is simpler and
// safer than shifting a window of rows, and it's a single statement. Callers
// must hold lockUserList first — this alone doesn't prevent the lost-update
// race, since the read that builds `orderedIds` happens before this is called.
export async function rewrite(tx: Executor, userId: string, orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return
  const total = orderedIds.length
  await tx
    .insert(rankings)
    .values(
      orderedIds.map((restaurantId, i) => ({
        userId,
        restaurantId,
        position: i + 1,
        score: scoreFor(i, total),
      })),
    )
    .onConflictDoUpdate({
      target: [rankings.userId, rankings.restaurantId],
      set: {
        position: sql`excluded.position`,
        score: sql`excluded.score`,
        // Only rows that actually moved get a fresh updatedAt — a full-list
        // rewrite used to stamp every row on every rank, including places
        // whose position didn't change, which is what let the feed (paged on
        // this column) treat "ranked one new place" as "republish the whole
        // list". The feed itself now pages on createdAt instead (see
        // routes/feed.ts), but this column should mean what it says regardless.
        updatedAt: sql`case when ${rankings.position} is distinct from excluded.position or ${rankings.score} is distinct from excluded.score then now() else ${rankings.updatedAt} end`,
      },
    })
}
