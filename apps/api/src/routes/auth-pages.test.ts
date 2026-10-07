import { afterAll, afterEach, describe, expect, test } from 'bun:test'

import { eq } from 'drizzle-orm'
import { Hono } from 'hono'

import type { AppEnv } from '../context'

// The emailed password-reset page against a real Better Auth and Postgres. The case it pins: a
// password on the breach list must not spend the link. Better Auth consumes the token before it
// hashes (and its breach check runs inside the hash), so the page checks the list first — this
// test is what proves the second, good password still goes through on the same link.
// Local-only, tag-and-clean-up harness; see events.test.ts's header for why it's gated this way.

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
  const [{ db, schema }, { auth }, { authPagesRoutes }] = await Promise.all([
    import('@mesa/db'),
    import('../auth'),
    import('./auth-pages'),
  ])
  return { db, schema, auth, authPagesRoutes }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

const BREACHED = 'password123'
const GOOD = 'una contraseña nueva para mesa'

async function sha1(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

// Stand in for the breach service (both the page's lookup and Better Auth's own): BREACHED is
// listed, everything else is not. Every other request passes through untouched.
const realFetch = globalThis.fetch
let breachServiceDown = false
async function installBreachService() {
  const listed = (await sha1(BREACHED)).slice(5)
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const target = String(input instanceof Request ? input.url : input)
    if (!target.startsWith('https://api.pwnedpasswords.com/range/')) return realFetch(input, init)
    if (breachServiceDown) return new Response('', { status: 503 })
    return new Response(`${listed}:251682\r\n0000000000000000000000000000000000A:0\r\n`)
  }) as typeof fetch
}

describe.skipIf(!deps)('password reset page (local DB)', () => {
  if (!deps) return
  const { db, schema, auth, authPagesRoutes } = deps
  const app = new Hono<AppEnv>().route('/p', authPagesRoutes)

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const userId = `${tag}-member`

  async function issueToken(): Promise<string> {
    const token = `${tag}-${crypto.randomUUID()}`
    const ctx = await auth.$context
    await ctx.internalAdapter.createVerificationValue({
      identifier: `reset-password:${token}`,
      value: userId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })
    return token
  }

  const submit = (token: string, password: string) =>
    app.request('/p/reset-password', {
      method: 'POST',
      body: new URLSearchParams({ token, password, confirm: password }),
    })

  afterEach(() => {
    breachServiceDown = false
  })

  afterAll(async () => {
    globalThis.fetch = realFetch
    // Cascades the account, sessions and audit rows.
    await db.delete(schema.user).where(eq(schema.user.id, userId))
  })

  test('a breached password keeps the link; a good one on the same link then resets', async () => {
    await installBreachService()
    await db.insert(schema.user).values({
      id: userId,
      name: 'Reset member',
      email: `${userId}@example.test`,
    })
    const token = await issueToken()

    const first = await submit(token, BREACHED)
    const firstHtml = await first.text()
    expect(first.status).toBe(400)
    expect(firstHtml).toContain('filtración')
    expect(firstHtml).toContain('<form')
    expect(firstHtml).toContain(`value="${token}"`)

    const second = await submit(token, GOOD)
    const secondHtml = await second.text()
    expect(second.status).toBe(200)
    expect(secondHtml).toContain('Tu contraseña quedó actualizada')

    // Spent now: the link is single-use.
    const third = await submit(token, `${GOOD} otra vez`)
    expect(await third.text()).toContain('Enlace vencido')
  })

  test('when the breach list cannot be reached, the link survives and the member can retry', async () => {
    await installBreachService()
    const token = await issueToken()

    breachServiceDown = true
    const down = await submit(token, GOOD)
    expect(down.status).toBe(503)
    expect(await down.text()).toContain('Intenta de nuevo')

    breachServiceDown = false
    const retry = await submit(token, GOOD)
    expect(retry.status).toBe(200)
  })

  test('a password over the maximum keeps the link and says why', async () => {
    const token = await issueToken()
    const res = await submit(token, 'x'.repeat(129))
    expect(res.status).toBe(400)
    const html = await res.text()
    expect(html).toContain('como máximo 128')
    expect(html).toContain(`value="${token}"`)
  })
})
