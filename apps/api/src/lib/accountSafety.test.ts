import { afterAll, describe, expect, test } from 'bun:test'

import { eq, inArray, like } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthedEnv } from '../context'
import { type ObjectStore, deleteByPrefix } from './r2'

// F2: account deletion really erases, the daily budget holds, a delete-password guess is throttled,
// and a member who has not accepted the terms cannot post. Real Postgres, local only (see
// routes/social.test.ts for the harness); the object-store sweep is tested against a fake store.

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
  const [
    { db, schema },
    { eraseAccount },
    { spendBudget },
    { clearFailures, lockedForMs, noteFailure },
    { commentsRoutes },
    { moderationRoutes },
  ] = await Promise.all([
    import('@mesa/db'),
    import('./accountErase'),
    import('./usageBudget'),
    import('./authThrottle'),
    import('../routes/comments'),
    import('../routes/moderation'),
  ])
  return {
    db,
    schema,
    eraseAccount,
    spendBudget,
    clearFailures,
    lockedForMs,
    noteFailure,
    commentsRoutes,
    moderationRoutes,
  }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

describe('deleteByPrefix', () => {
  test('sweeps every page under the prefix, and nothing when there is none', async () => {
    const stored = new Set(Array.from({ length: 7 }, (_, i) => `u/m1/${i}.jpg`))
    stored.add('u/other/keep.jpg')
    const store: ObjectStore = {
      async list({ prefix, maxKeys = 3 }) {
        const all = [...stored].filter((k) => k.startsWith(prefix))
        const page = all.slice(0, Math.min(maxKeys, 3)) // the store pages at 3, whatever is asked
        return { contents: page.map((key) => ({ key })), isTruncated: all.length > page.length }
      },
      async delete(key) {
        stored.delete(key)
      },
    }
    expect(await deleteByPrefix(store, 'u/m1/')).toBe(7)
    expect([...stored]).toEqual(['u/other/keep.jpg'])
    expect(await deleteByPrefix(store, 'u/m1/')).toBe(0)
  })
})

describe.skipIf(!deps)('account safety (local DB)', () => {
  if (!deps) return
  const {
    db,
    schema,
    eraseAccount,
    spendBudget,
    clearFailures,
    lockedForMs,
    noteFailure,
    commentsRoutes,
    moderationRoutes,
  } = deps
  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const keys: string[] = []
  const throttleKeys: string[] = []

  afterAll(async () => {
    if (keys.length)
      await db.delete(schema.usageCounter).where(inArray(schema.usageCounter.key, keys))
    if (throttleKeys.length) {
      await db.delete(schema.authThrottle).where(inArray(schema.authThrottle.key, throttleKeys))
    }
    await db.delete(schema.waitlist).where(like(schema.waitlist.email, `${tag}%`))
    await db.delete(schema.verification).where(like(schema.verification.identifier, `${tag}%`))
    await db.delete(schema.user).where(like(schema.user.id, `${tag}%`))
  })

  test('a daily budget lets the amount in, refuses what would exceed it, and restarts after a day', async () => {
    const key = `${tag}:budget`
    keys.push(key)
    expect(await spendBudget(key, 40, 100)).toBe(true)
    expect(await spendBudget(key, 50, 100)).toBe(true) // 90 so far
    expect(await spendBudget(key, 20, 100)).toBe(false) // 110: over
    expect(await spendBudget(key, 1, 100)).toBe(false) // the refused spend still counts
    // A day later the window starts over.
    await db
      .update(schema.usageCounter)
      .set({ windowStart: new Date(Date.now() - 25 * 3600_000) })
      .where(eq(schema.usageCounter.key, key))
    expect(await spendBudget(key, 100, 100)).toBe(true)
  })

  test('guessing a password backs off after five misses, and a clean attempt clears it', async () => {
    const key = `${tag}:delete`
    throttleKeys.push(key)
    for (let i = 0; i < 4; i++) await noteFailure(key)
    expect(await lockedForMs(key)).toBe(0) // the first four are free
    await noteFailure(key)
    expect(await lockedForMs(key)).toBeGreaterThan(0)
    await clearFailures(key)
    expect(await lockedForMs(key)).toBe(0)
  })

  test('deleting an account removes the row and what is keyed by their email or id', async () => {
    const id = `${tag}-gone`
    const email = `${tag}-Gone@Example.test`
    await db.insert(schema.user).values({ id, name: 'Gone', email: email.toLowerCase() })
    await db.insert(schema.authThrottle).values({
      key: `signin:${email.toLowerCase()}`,
      failures: 3,
      lastFailureAt: new Date(),
    })
    await db.insert(schema.authThrottle).values({
      key: `delete:${id}`,
      failures: 1,
      lastFailureAt: new Date(),
    })
    await db.insert(schema.usageCounter).values({ key: `match:${id}`, used: 10 })
    await db.insert(schema.waitlist).values({ email })
    await db.insert(schema.verification).values({
      id: `${tag}-v`,
      identifier: email,
      value: 'x',
      expiresAt: new Date(Date.now() + 3600_000),
    })

    const res = await eraseAccount({ id, email })
    expect(res.photos).toBe(0) // uploads are off locally: nothing to sweep, and not an error

    expect(await db.query.user.findFirst({ where: eq(schema.user.id, id) })).toBeUndefined()
    expect(
      await db.query.authThrottle.findMany({
        where: like(schema.authThrottle.key, `%${tag}-gone%`),
      }),
    ).toHaveLength(0)
    expect(
      await db.query.usageCounter.findFirst({ where: eq(schema.usageCounter.key, `match:${id}`) }),
    ).toBeUndefined()
    expect(
      await db.query.waitlist.findMany({ where: like(schema.waitlist.email, `${tag}%`) }),
    ).toHaveLength(0)
    expect(
      await db.query.verification.findMany({
        where: like(schema.verification.identifier, `${tag}%`),
      }),
    ).toHaveLength(0)
  })

  test('without accepted terms a member cannot post, but can still report', async () => {
    const id = `${tag}-noeula`
    const other = `${tag}-other`
    await db.insert(schema.user).values([
      { id, name: 'No terms', email: `${id}@example.test`, handle: id },
      { id: other, name: 'Other', email: `${other}@example.test`, handle: other },
    ])
    type Me = AuthedEnv['Variables']['user']
    const me: Me = {
      id,
      name: 'No terms',
      email: `${id}@example.test`,
      emailVerified: false,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const app = new Hono<AuthedEnv>()
      .use(async (c, next) => {
        c.set('user', me)
        c.set('session', null)
        await next()
      })
      .route('/comments', commentsRoutes)
      .route('/moderation', moderationRoutes)
    const post = (path: string, body: unknown) =>
      app.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

    const comment = await post(`/comments/ranking/${crypto.randomUUID()}`, { body: 'hello' })
    expect(comment.status).toBe(403)
    expect(await comment.json()).toEqual({ error: 'eula_required' })

    // Protecting yourself never waits on the terms.
    const report = await post('/moderation/reports', {
      targetType: 'user',
      targetId: other,
      reason: 'spam',
    })
    expect(report.status).toBe(200)

    // Once accepted, the same request gets past the guard (to a 404: there is no such ranking).
    me.eulaAcceptedAt = new Date()
    expect((await post(`/comments/ranking/${crypto.randomUUID()}`, { body: 'hello' })).status).toBe(
      404,
    )
  })
})
