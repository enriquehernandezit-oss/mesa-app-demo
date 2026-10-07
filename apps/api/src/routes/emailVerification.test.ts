import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'

import { eq, like } from 'drizzle-orm'

// Confirming an email + password sign-up with a 6-digit code, against a real Better Auth and
// Postgres. Local-only, tag-and-clean-up harness; see events.test.ts's header for why it's gated.
//
// REQUIRE_EMAIL_VERIFICATION is read when auth.ts loads, and other test files load it first with the
// default. This file imports its own copy (the query string makes Bun treat it as a separate
// module), with the flag set just for that import.

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
  process.env.REQUIRE_EMAIL_VERIFICATION = 'true'
  try {
    const own = `../auth?confirm=${crypto.randomUUID()}`
    const [{ db, schema }, { auth }, { throttleKey }] = await Promise.all([
      import('@mesa/db'),
      import(own) as Promise<typeof import('../auth')>,
      import('../lib/authThrottle'),
    ])
    return { db, schema, auth, throttleKey }
  } finally {
    delete process.env.REQUIRE_EMAIL_VERIFICATION
  }
}
const deps = (await localDbReachable()) ? await loadDeps() : null

// The breach list is a network call made while hashing a new password; keep the tests offline.
const realFetch = globalThis.fetch

describe.skipIf(!deps)('email confirmation by code (local DB)', () => {
  if (!deps) return
  const { db, schema, auth, throttleKey } = deps

  const tag = `test-${crypto.randomUUID().slice(0, 8)}`
  const password = 'una contraseña larga para mesa'
  let counter = 0
  const newEmail = () => `${tag}-${++counter}@example.test`

  // Mail goes to the console in test (no provider key). Capture what would have been sent.
  const mail: { to: string; subject: string }[] = []
  let logSpy: ReturnType<typeof spyOn<Console, 'log'>>

  beforeEach(() => {
    mail.length = 0
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const target = String(input instanceof Request ? input.url : input)
      if (target.startsWith('https://api.pwnedpasswords.com/')) return new Response('')
      return realFetch(input, init)
    }) as typeof fetch
    const original = console.log.bind(console)
    logSpy = spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      const line = String(args[0] ?? '')
      const m = line.match(/^\[dev email\] to=(\S+) · (.*)$/m)
      if (m?.[1] && m[2]) mail.push({ to: m[1], subject: m[2] })
      else original(...args)
    })
  })

  afterEach(() => {
    logSpy.mockRestore()
    globalThis.fetch = realFetch
  })

  afterAll(async () => {
    await db.delete(schema.user).where(like(schema.user.email, `${tag}-%`))
    await db.delete(schema.verification).where(like(schema.verification.identifier, `%${tag}-%`))
  })

  // sendMail is not awaited by Better Auth, so give the background send a moment.
  async function lastCode(email: string): Promise<string> {
    for (let i = 0; i < 40; i++) {
      const sent = mail.filter((m) => m.to === email)
      const subject = sent[sent.length - 1]?.subject
      const code = subject?.match(/^(\d{6}) es tu código de Mesa$/)?.[1]
      if (code) return code
      await Bun.sleep(25)
    }
    throw new Error(`no code mailed to ${email}`)
  }

  const signUp = (email: string) =>
    auth.api.signUpEmail({ body: { email, password, name: 'Code member' } })
  const signIn = (email: string, pw = password) =>
    auth.api.signInEmail({ body: { email, password: pw } })
  const verify = (email: string, otp: string) => auth.api.verifyEmailOTP({ body: { email, otp } })
  const errorOf = async (run: () => Promise<unknown>) => {
    try {
      await run()
    } catch (err) {
      return err as { status?: string | number; body?: { code?: string } }
    }
    throw new Error('expected the call to fail')
  }

  test('sign-up gives no session; the code from the email confirms and signs in', async () => {
    const email = newEmail()
    const created = await signUp(email)
    expect(created.token).toBeNull()
    const first = await lastCode(email)
    expect(first).toMatch(/^\d{6}$/)

    // The code from sign-up works on its own...
    const blocked = await errorOf(() => signIn(email))
    expect(blocked.body?.code).toBe('EMAIL_NOT_VERIFIED')
    // ...but the sign-in just mailed a newer one, and the newest code is the only live one.
    mail.splice(0, mail.length - 1)
    const code = await lastCode(email)
    const stale = first === code ? '' : first
    if (stale) expect((await errorOf(() => verify(email, stale))).body?.code).toBe('INVALID_OTP')

    const done = await verify(email, code)
    expect(done.status).toBe(true)
    expect(done.token).toBeTruthy()

    const [row] = await db.select().from(schema.user).where(eq(schema.user.email, email))
    expect(row?.emailVerified).toBe(true)
    const again = await signIn(email)
    expect(again.token).toBeTruthy()
  })

  test('a sign-in with the right password while unconfirmed mails a fresh code and is not a failed attempt', async () => {
    const email = newEmail()
    await signUp(email)
    await lastCode(email)
    mail.length = 0

    for (let i = 0; i < 6; i++) {
      const blocked = await errorOf(() => signIn(email))
      expect(blocked.body?.code).toBe('EMAIL_NOT_VERIFIED')
    }
    // Six "unconfirmed" sign-ins would lock a member out if they counted as failures (5 is the limit).
    const [row] = await db
      .select()
      .from(schema.authThrottle)
      .where(eq(schema.authThrottle.key, throttleKey(email)))
    expect(row).toBeUndefined()

    const code = await lastCode(email)
    expect((await verify(email, code)).status).toBe(true)
  })

  test('a wrong password does not mail a code', async () => {
    const email = newEmail()
    await signUp(email)
    await lastCode(email)
    mail.length = 0
    const err = await errorOf(() => signIn(email, 'not the password at all'))
    expect(err.body?.code).toBe('INVALID_EMAIL_OR_PASSWORD')
    await Bun.sleep(150)
    expect(mail).toHaveLength(0)
  })

  test('a wrong code is refused and three wrong guesses spend the code', async () => {
    const email = newEmail()
    await signUp(email)
    const code = await lastCode(email)
    const wrong = code === '000000' ? '111111' : '000000'

    for (let i = 0; i < 3; i++) {
      const err = await errorOf(() => verify(email, wrong))
      expect(err.body?.code).toBe('INVALID_OTP')
    }
    const spent = await errorOf(() => verify(email, code))
    expect(spent.body?.code).toBe('TOO_MANY_ATTEMPTS')

    const [row] = await db.select().from(schema.user).where(eq(schema.user.email, email))
    expect(row?.emailVerified).toBe(false)
  })

  test('a code is not mailed for an address that is already confirmed', async () => {
    const email = newEmail()
    await signUp(email)
    await verify(email, await lastCode(email))
    mail.length = 0

    const res = await auth.api.sendVerificationOTP({ body: { email, type: 'email-verification' } })
    expect(res.success).toBe(true)
    await Bun.sleep(150)
    expect(mail).toHaveLength(0)
  })

  test('the plugin routes Mesa does not use are closed over HTTP', async () => {
    for (const path of [
      '/api/auth/sign-in/email-otp',
      '/api/auth/email-otp/check-verification-otp',
      '/api/auth/email-otp/reset-password',
      '/api/auth/forget-password/email-otp',
    ]) {
      const res = await auth.handler(
        new Request(`http://localhost:3000${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
          body: JSON.stringify({ email: 'x@example.test', otp: '123456', type: 'sign-in' }),
        }),
      )
      expect(res.status).toBe(404)
    }
  })
})
