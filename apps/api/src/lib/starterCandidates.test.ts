import { describe, expect, test } from 'bun:test'

// The sign-up starter list must never come back empty. With no demo rows and no editorial lists (a
// database that never had the seed), the wider catalog tops it up. Local-only: it empties the curated
// set inside a transaction and rolls the transaction back.

const url = process.env.DATABASE_URL ?? ''
const isLocalUrl = /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)

async function localDbReachable(): Promise<boolean> {
  if (!isLocalUrl) return false
  try {
    const { pool } = await import('@mesa/db')
    await pool.query('select 1')
    return true
  } catch {
    return false
  }
}

async function loadDeps() {
  const [{ db, schema }, mod] = await Promise.all([
    import('@mesa/db'),
    import('./starterCandidates'),
  ])
  return { db, schema, ...mod }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

class Rollback extends Error {}

describe.skipIf(!deps)('the sign-up starter list (local DB)', () => {
  if (!deps) return
  const { db, schema, starterCandidates, STARTER_CANDIDATES } = deps

  test('is the curated cluster when there is one', async () => {
    const rows = await db.transaction((tx) => starterCandidates(tx))
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThanOrEqual(STARTER_CANDIDATES)
  })

  test('is topped up from the whole catalog when no place is curated', async () => {
    let got: Awaited<ReturnType<typeof starterCandidates>> = []
    await db
      .transaction(async (tx) => {
        await tx.update(schema.restaurants).set({ isDemo: false })
        await tx.delete(schema.listItems)
        got = await starterCandidates(tx)
        throw new Rollback()
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err
      })
    expect(got.length).toBe(STARTER_CANDIDATES)
    expect(new Set(got.map((r) => r.id)).size).toBe(got.length)
  })
})
