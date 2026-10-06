import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { generateKeyPairSync } from 'node:crypto'

import { eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AuthedEnv } from '../context'

// Deleting an account that signs in with Apple (App Store 5.1.1(v)): a fresh Apple authorization code
// is the proof of identity AND lets the server revoke Mesa's grant at Apple. Real Postgres, same
// local-only, tag-and-clean-up harness as privacyGaps.test.ts; Apple itself is a fake `fetch`.

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
  const [{ db, schema }, { meRoutes }] = await Promise.all([import('@mesa/db'), import('./me')])
  return { db, schema, meRoutes }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

type Me = AuthedEnv['Variables']['user']
type Sess = NonNullable<AuthedEnv['Variables']['session']>

const idToken = (sub: string) => `x.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.y`

describe.skipIf(!deps)('deleting an account that signs in with Apple (local DB)', () => {
  if (!deps) return
  const { db, schema, meRoutes } = deps

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const ids = { mine: `${tag}-mine`, other: `${tag}-other`, nokey: `${tag}-nokey` }
  const person = (id: string): Me => ({
    id,
    name: id,
    email: `${id}@example.test`,
    emailVerified: false,
    eulaAcceptedAt: new Date(),
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  // A session from long ago: without the Apple proof, the deletion is refused as "not fresh".
  const staleSession = { createdAt: new Date(Date.now() - 3 * 24 * 3600_000) } as unknown as Sess

  const appFor = (me: Me) =>
    new Hono<AuthedEnv>()
      .use(async (c, next) => {
        c.set('user', me)
        c.set('session', staleSession)
        await next()
      })
      .route('/me', meRoutes)
  const del = (me: Me, body: unknown) =>
    appFor(me).request('/me', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  const exists = async (id: string) =>
    Boolean(await db.query.user.findFirst({ where: eq(schema.user.id, id), columns: { id: true } }))

  // Apple, faked: the token endpoint answers for the account's own Apple id (or another's), and every
  // call is recorded.
  const realFetch = globalThis.fetch
  const calls: { url: string; body: URLSearchParams }[] = []
  let tokenSub = `apple-sub-${tag}`
  const fakeApple = (async (input: string | URL | Request, init?: RequestInit) => {
    const u = String(input)
    if (!u.startsWith('https://appleid.apple.com/')) return realFetch(input, init)
    calls.push({ url: u, body: new URLSearchParams(String(init?.body)) })
    if (u.endsWith('/auth/token')) {
      return new Response(
        JSON.stringify({
          refresh_token: 'refresh-1',
          access_token: 'access-1',
          id_token: idToken(tokenSub),
        }),
        { status: 200 },
      )
    }
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const saved = {
    team: process.env.APPLE_TEAM_ID,
    key: process.env.APPLE_KEY_ID,
    pk: process.env.APPLE_PRIVATE_KEY,
  }

  beforeAll(async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    process.env.APPLE_TEAM_ID = 'TEAM123456'
    process.env.APPLE_KEY_ID = 'KEY1234567'
    process.env.APPLE_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string

    for (const id of Object.values(ids)) {
      await db.insert(schema.user).values({ id, name: id, email: `${id}@example.test`, handle: id })
      await db.insert(schema.account).values({
        id: `${id}-acct`,
        accountId: id === ids.other ? `apple-sub-other-${tag}` : `apple-sub-${tag}`,
        providerId: 'apple',
        userId: id,
      })
    }
    globalThis.fetch = fakeApple
  })

  afterEach(() => {
    calls.length = 0
    tokenSub = `apple-sub-${tag}`
  })

  afterAll(async () => {
    globalThis.fetch = realFetch
    for (const [k, v] of [
      ['APPLE_TEAM_ID', saved.team],
      ['APPLE_KEY_ID', saved.key],
      ['APPLE_PRIVATE_KEY', saved.pk],
    ] as const) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    await db.delete(schema.user).where(inArray(schema.user.id, Object.values(ids)))
  })

  test('without the Apple proof, a stale session cannot delete (as before)', async () => {
    const res = await del(person(ids.nokey), {})
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error: string }).error).toBe('session_not_fresh')
    expect(await exists(ids.nokey)).toBe(true)
    expect(calls).toHaveLength(0)
  })

  test("a code for someone else's Apple ID proves nothing: refused, nothing revoked", async () => {
    tokenSub = `apple-sub-someone-else-${tag}`
    const res = await del(person(ids.other), { appleAuthorizationCode: 'stolen-or-wrong' })
    expect(res.status).toBe(403)
    expect(await exists(ids.other)).toBe(true)
    expect(calls.some((c) => c.url.endsWith('/auth/revoke'))).toBe(false)
  })

  test("the account's own Apple code is the proof: deleted, and Mesa's grant is revoked at Apple", async () => {
    const res = await del(person(ids.mine), { appleAuthorizationCode: 'good-code' })
    expect(res.status).toBe(200)
    expect(await exists(ids.mine)).toBe(false)
    const revoke = calls.find((c) => c.url.endsWith('/auth/revoke'))
    expect(revoke?.body.get('token')).toBe('refresh-1')
    expect(revoke?.body.get('token_type_hint')).toBe('refresh_token')
    expect(revoke?.body.get('client_id')).toBe('com.mesasocial.app')
  })

  test('with the Apple key unset, a code is ignored and the old rule applies', async () => {
    delete process.env.APPLE_PRIVATE_KEY
    const res = await del(person(ids.nokey), { appleAuthorizationCode: 'good-code' })
    expect(res.status).toBe(403)
    expect(await exists(ids.nokey)).toBe(true)
    expect(calls).toHaveLength(0)
  })
})
