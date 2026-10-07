// Is this password in a known breach? The same k-anonymity lookup Better Auth's haveIBeenPwned plugin
// makes — only the first 5 characters of the SHA-1 hash leave the server, never the password.
//
// It exists because the plugin runs its check while hashing, and Better Auth's reset endpoint spends
// the one-time token BEFORE it hashes. A rejected password therefore burned the emailed link: the page
// asked for a different password, and the second try reported the link as expired. The reset page asks
// this first, while the token is still unspent, and only hands Better Auth a password that passes.
//
// 'unknown' when the breach list can't be reached: the caller keeps the token and asks to try again,
// because sending the password on would fail the plugin's own check and burn the token anyway.
export type BreachCheck = 'breached' | 'clean' | 'unknown'

const RANGE_URL = 'https://api.pwnedpasswords.com/range/'

export async function checkBreached(
  password: string,
  fetchFn: typeof fetch = fetch,
): Promise<BreachCheck> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password))
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
  const prefix = hash.slice(0, 5)
  const suffix = hash.slice(5)
  try {
    const res = await fetchFn(RANGE_URL + prefix, {
      // Padding hides how many real entries share the prefix; padded rows carry a count of 0.
      headers: { 'Add-Padding': 'true', 'User-Agent': 'Mesa password check' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return 'unknown'
    const body = await res.text()
    for (const line of body.split('\n')) {
      const [candidate, count] = line.trim().split(':')
      if (candidate?.toUpperCase() === suffix && Number(count) > 0) return 'breached'
    }
    return 'clean'
  } catch {
    return 'unknown'
  }
}
