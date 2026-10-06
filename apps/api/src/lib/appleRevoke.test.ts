import { describe, expect, test } from 'bun:test'
import { generateKeyPairSync, verify } from 'node:crypto'

import {
  type AppleConfig,
  appleConfig,
  clientSecret,
  exchangeAuthorizationCode,
  normalizePrivateKey,
  revokeAppleTokens,
  subOfIdToken,
} from './appleRevoke'

// A throwaway P-256 key in Apple's format (a PKCS#8 .p8), so the signing is exercised for real.
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const cfg: AppleConfig = {
  teamId: 'TEAM123456',
  keyId: 'KEY1234567',
  privateKey: pem,
  clientId: 'com.mesasocial.app',
}

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))

describe('appleConfig / normalizePrivateKey', () => {
  test('null until all three variables are set', () => {
    expect(appleConfig({})).toBeNull()
    expect(appleConfig({ APPLE_TEAM_ID: 'T', APPLE_KEY_ID: 'K' })).toBeNull()
  })

  test('reads real PEM, \\n-escaped PEM and base64 PEM alike', () => {
    const base = { APPLE_TEAM_ID: 'T', APPLE_KEY_ID: 'K' }
    for (const raw of [pem, pem.replace(/\n/g, '\\n'), Buffer.from(pem).toString('base64')]) {
      expect(appleConfig({ ...base, APPLE_PRIVATE_KEY: raw })?.privateKey).toBe(pem.trim())
    }
    expect(normalizePrivateKey(pem)).toBe(pem.trim())
  })

  test('the client id is the app bundle id, defaulting to Mesa', () => {
    const base = { APPLE_TEAM_ID: 'T', APPLE_KEY_ID: 'K', APPLE_PRIVATE_KEY: pem }
    expect(appleConfig(base)?.clientId).toBe('com.mesasocial.app')
    expect(appleConfig({ ...base, APPLE_APP_BUNDLE_ID: 'com.example.x' })?.clientId).toBe(
      'com.example.x',
    )
  })
})

describe('clientSecret', () => {
  test('is an ES256 JWT Apple can verify, with the claims it requires', () => {
    const now = new Date('2026-10-06T12:00:00Z')
    const [h, c, s] = clientSecret(cfg, now).split('.') as [string, string, string]
    expect(decode(h)).toEqual({ alg: 'ES256', kid: 'KEY1234567', typ: 'JWT' })
    const claims = decode(c)
    expect(claims).toMatchObject({
      iss: 'TEAM123456',
      sub: 'com.mesasocial.app',
      aud: 'https://appleid.apple.com',
    })
    expect(claims.exp - claims.iat).toBe(300)
    // the signature is the raw r||s form, and verifies against the public key
    const sig = Buffer.from(s, 'base64url')
    expect(sig).toHaveLength(64)
    expect(
      verify(
        'sha256',
        Buffer.from(`${h}.${c}`),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        sig,
      ),
    ).toBe(true)
  })
})

const idToken = (sub: string) => `x.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.y`

describe('subOfIdToken', () => {
  test('reads the Apple user id, or null for rubbish', () => {
    expect(subOfIdToken(idToken('001.abc'))).toBe('001.abc')
    expect(subOfIdToken('garbage')).toBeNull()
    expect(subOfIdToken(undefined)).toBeNull()
  })
})

type Call = { url: string; body: URLSearchParams }
const fakeFetch = (status: number, json: unknown = {}) => {
  const calls: Call[] = []
  const fn = async (url: string, init: RequestInit) => {
    calls.push({ url, body: new URLSearchParams(String(init.body)) })
    return new Response(JSON.stringify(json), { status })
  }
  return { fn, calls }
}

describe('exchangeAuthorizationCode', () => {
  test('trades the code for tokens and reads who they belong to', async () => {
    const f = fakeFetch(200, { refresh_token: 'r', access_token: 'a', id_token: idToken('001.me') })
    const got = await exchangeAuthorizationCode('the-code', cfg, f.fn)
    expect(got).toEqual({ refreshToken: 'r', accessToken: 'a', sub: '001.me' })
    expect(f.calls[0]?.url).toBe('https://appleid.apple.com/auth/token')
    expect(f.calls[0]?.body.get('grant_type')).toBe('authorization_code')
    expect(f.calls[0]?.body.get('code')).toBe('the-code')
    expect(f.calls[0]?.body.get('client_id')).toBe('com.mesasocial.app')
    expect(f.calls[0]?.body.get('client_secret')?.split('.')).toHaveLength(3)
  })

  test('null when Apple refuses the code or cannot be reached', async () => {
    expect(
      await exchangeAuthorizationCode('bad', cfg, fakeFetch(400, { error: 'invalid_grant' }).fn),
    ).toBeNull()
    const boom = async () => {
      throw new Error('offline')
    }
    expect(await exchangeAuthorizationCode('x', cfg, boom)).toBeNull()
  })
})

describe('revokeAppleTokens', () => {
  test('revokes the refresh token, naming its type', async () => {
    const f = fakeFetch(200)
    expect(
      await revokeAppleTokens({ refreshToken: 'r', accessToken: 'a', sub: 's' }, cfg, f.fn),
    ).toBe(true)
    expect(f.calls[0]?.url).toBe('https://appleid.apple.com/auth/revoke')
    expect(f.calls[0]?.body.get('token')).toBe('r')
    expect(f.calls[0]?.body.get('token_type_hint')).toBe('refresh_token')
  })

  test('falls back to the access token; false with none, or when Apple says no', async () => {
    const f = fakeFetch(200)
    await revokeAppleTokens({ refreshToken: null, accessToken: 'a', sub: null }, cfg, f.fn)
    expect(f.calls[0]?.body.get('token_type_hint')).toBe('access_token')
    expect(
      await revokeAppleTokens({ refreshToken: null, accessToken: null, sub: null }, cfg, f.fn),
    ).toBe(false)
    expect(
      await revokeAppleTokens(
        { refreshToken: 'r', accessToken: null, sub: null },
        cfg,
        fakeFetch(400).fn,
      ),
    ).toBe(false)
  })
})
