import { describe, expect, test } from 'bun:test'

import { checkBreached } from './pwnedPassword'

async function sha1(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

// A fake breach service: answers the range request with the given body and records the URL asked for.
function fakeRange(body: string, status = 200) {
  const asked: string[] = []
  const fetchFn = (async (input: string | URL | Request) => {
    asked.push(String(input))
    return new Response(body, { status })
  }) as typeof fetch
  return { fetchFn, asked }
}

describe('checkBreached', () => {
  test('sends only the 5-character hash prefix, never the password', async () => {
    const hash = await sha1('correct horse battery staple')
    const { fetchFn, asked } = fakeRange('')
    await checkBreached('correct horse battery staple', fetchFn)
    expect(asked).toEqual([`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`])
    expect(asked[0]).not.toContain('horse')
  })

  test('a listed suffix with a count is breached', async () => {
    const hash = await sha1('password123')
    const { fetchFn } = fakeRange(
      `0000000000000000000000000000000000A:3\r\n${hash.slice(5)}:251682\r\n`,
    )
    expect(await checkBreached('password123', fetchFn)).toBe('breached')
  })

  test('a padded row (count 0) is not a breach', async () => {
    const hash = await sha1('mesa-padding-check')
    const { fetchFn } = fakeRange(`${hash.slice(5)}:0\r\n`)
    expect(await checkBreached('mesa-padding-check', fetchFn)).toBe('clean')
  })

  test('an unlisted suffix is clean', async () => {
    const { fetchFn } = fakeRange('0000000000000000000000000000000000A:3\r\n')
    expect(await checkBreached('a fine new password', fetchFn)).toBe('clean')
  })

  test('an error or an unreachable service is unknown, not clean', async () => {
    expect(await checkBreached('anything at all', fakeRange('', 503).fetchFn)).toBe('unknown')
    const down = (async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(await checkBreached('anything at all', down)).toBe('unknown')
  })
})
