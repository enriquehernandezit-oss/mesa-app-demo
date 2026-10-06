import { createPrivateKey, sign } from 'node:crypto'

// Sign in with Apple, on the way OUT. App Store 5.1.1(v): when someone who signed in with Apple
// deletes their account, the app must also revoke the Apple grant — otherwise "Mesa" stays listed under
// Settings → Apple ID → Sign in with Apple, for an account that no longer exists.
//
// How it works. The app asks Apple again at deletion time (a fresh sign-in sheet) and sends the
// one-time `authorizationCode` it gets. The server trades that code for tokens at Apple, checks the
// token's subject is the Apple account linked here, and revokes the refresh token. The code is also the
// proof of identity for the deletion: only the holder of that Apple ID can produce one.
//
// Needs three env vars from the Apple Developer account (a Key with "Sign in with Apple" enabled):
// APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (the .p8 file's contents). Unset, everything here is a
// no-op and deletion works as before. Best effort by design: Apple being down must never keep a member
// from deleting their account.

const AUDIENCE = 'https://appleid.apple.com'
const TOKEN_URL = `${AUDIENCE}/auth/token`
const REVOKE_URL = `${AUDIENCE}/auth/revoke`
// The audience of a code obtained by the native app is the app's bundle id.
const DEFAULT_BUNDLE_ID = 'com.mesasocial.app'

export type AppleConfig = { teamId: string; keyId: string; privateKey: string; clientId: string }

// The .p8 as pasted into a variable: PEM text (real or `\n`-escaped newlines), or the whole file
// base64-encoded.
export function normalizePrivateKey(raw: string): string {
  const text = raw.trim()
  if (text.includes('BEGIN')) return text.replace(/\\n/g, '\n').trim()
  return Buffer.from(text, 'base64').toString('utf8').trim()
}

export function appleConfig(
  env: Record<string, string | undefined> = process.env,
): AppleConfig | null {
  const teamId = env.APPLE_TEAM_ID?.trim()
  const keyId = env.APPLE_KEY_ID?.trim()
  const key = env.APPLE_PRIVATE_KEY
  if (!teamId || !keyId || !key?.trim()) return null
  return {
    teamId,
    keyId,
    privateKey: normalizePrivateKey(key),
    clientId: env.APPLE_APP_BUNDLE_ID?.trim() || DEFAULT_BUNDLE_ID,
  }
}

const b64url = (v: Buffer | string) => Buffer.from(v).toString('base64url')

// The "client secret" Apple wants: a short-lived ES256 JWT signed with the .p8 key.
export function clientSecret(cfg: AppleConfig, now: Date = new Date()): string {
  const iat = Math.floor(now.getTime() / 1000)
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId, typ: 'JWT' }))
  const claims = b64url(
    JSON.stringify({ iss: cfg.teamId, iat, exp: iat + 300, aud: AUDIENCE, sub: cfg.clientId }),
  )
  const input = `${header}.${claims}`
  // JWT wants the raw r||s signature, not the DER encoding Node produces by default.
  const signature = sign('sha256', Buffer.from(input), {
    key: createPrivateKey(cfg.privateKey),
    dsaEncoding: 'ieee-p1363',
  })
  return `${input}.${b64url(signature)}`
}

export type AppleTokens = {
  refreshToken: string | null
  accessToken: string | null
  sub: string | null
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>

const form = (fields: Record<string, string>) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(fields).toString(),
})

// The `sub` of an Apple id_token (the stable Apple user id). Not verified here: the token came straight
// from Apple over TLS in answer to our own request, which is the verification.
export function subOfIdToken(idToken: string | undefined): string | null {
  const payload = idToken?.split('.')[1]
  if (!payload) return null
  try {
    const sub = (
      JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: unknown }
    ).sub
    return typeof sub === 'string' ? sub : null
  } catch {
    return null
  }
}

// Trade the app's one-time authorization code for tokens. Null when Apple refuses it (expired, reused,
// not ours) or cannot be reached.
export async function exchangeAuthorizationCode(
  code: string,
  cfg: AppleConfig,
  fetchFn: Fetch = fetch,
): Promise<AppleTokens | null> {
  try {
    const res = await fetchFn(
      TOKEN_URL,
      form({
        client_id: cfg.clientId,
        client_secret: clientSecret(cfg),
        code,
        grant_type: 'authorization_code',
      }),
    )
    if (!res.ok) {
      console.error(`apple: code exchange refused (${res.status})`)
      return null
    }
    const body = (await res.json()) as {
      refresh_token?: string
      access_token?: string
      id_token?: string
    }
    return {
      refreshToken: body.refresh_token ?? null,
      accessToken: body.access_token ?? null,
      sub: subOfIdToken(body.id_token),
    }
  } catch (err) {
    console.error('apple: code exchange failed', err instanceof Error ? err.message : err)
    return null
  }
}

// Revoke the grant. True when Apple accepted it.
export async function revokeAppleTokens(
  tokens: AppleTokens,
  cfg: AppleConfig,
  fetchFn: Fetch = fetch,
): Promise<boolean> {
  const token = tokens.refreshToken ?? tokens.accessToken
  if (!token) return false
  try {
    const res = await fetchFn(
      REVOKE_URL,
      form({
        client_id: cfg.clientId,
        client_secret: clientSecret(cfg),
        token,
        token_type_hint: tokens.refreshToken ? 'refresh_token' : 'access_token',
      }),
    )
    if (!res.ok) console.error(`apple: revoke refused (${res.status})`)
    return res.ok
  } catch (err) {
    console.error('apple: revoke failed', err instanceof Error ? err.message : err)
    return false
  }
}
