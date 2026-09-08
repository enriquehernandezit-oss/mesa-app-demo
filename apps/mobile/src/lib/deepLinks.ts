// Pure deep-link rewriting logic for +native-intent.tsx, split out so it can be
// unit tested with plain bun:test (no RN/expo-router runtime needed).
//
// expo-router's redirectSystemPath hands us the FULL url it was launched or
// resumed with — not a path. Verified against the installed expo-router:
// build/getLinkingConfig.js ({ path: initialUrl, ... } from
// Linking.getInitialURL()) and build/link/linking.js ({ path: url } from the
// 'url' event). A regex anchored at ^\/p\/... never matches
// "https://mesa.app/p/spot/x" or "mesa://p/spot/x" — every rewrite below used
// to be dead code for exactly this reason.
//
// Do NOT normalize with `new URL()`: for a custom scheme, new
// URL('mesa://p/spot/x').pathname is "/spot/x" — the WHATWG parser treats "p"
// as the host and swallows the /p prefix. So this strips scheme+authority by
// hand instead of trusting the URL parser to agree with our own route shape.

export type DeepLinkResult = { path: string; inviteCode?: string }

// "https://host/rest", "http://host/rest" -> "/rest" (rest keeps its own
// leading slash, query and all).
const HTTP_PREFIX = /^https?:\/\/[^/?#]+/i

// "scheme://..." or "scheme:..." for any custom scheme (mesa, exp+mesa, the
// dev-client's exp+mesa-development-client, etc).
const SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:\/{0,3}/i

// Reduce any of the shapes a launch/resume URL can arrive in down to a plain
// app-relative path ("/p/spot/abc?x=1"). Exported mainly so the test file can
// exercise it directly; +native-intent.tsx only needs toAppPath.
export function normalizeToPath(url: string): string {
  if (url.startsWith('/')) return url
  const http = url.match(HTTP_PREFIX)
  if (http) return url.slice(http[0].length) || '/'
  const scheme = url.match(SCHEME_PREFIX)
  if (scheme) {
    // "mesa://p/spot/x" -> after stripping "mesa://", the host-shaped "p/..."
    // remains; "mesa:///p/spot/x" (empty host) strips to "/p/spot/x" already.
    // Trimming every leading slash and re-adding exactly one normalizes both
    // to the same "/p/spot/x" shape the route regexes below expect.
    const rest = url.slice(scheme[0].length).replace(/^\/+/, '')
    return `/${rest}`
  }
  // Already-bare, non-absolute input (shouldn't happen from expo-router, but a
  // unit test or a future caller might pass one) — treat as-is.
  return url
}

// Mirrors the four branches +native-intent.tsx used to have inline. Returns
// null when nothing matches, so the caller can fall back to the ORIGINAL
// (unnormalized) input — returning the normalized-but-unmatched path here
// would silently change routing for every link this file doesn't know about.
export function toAppPath(url: string): DeepLinkResult | null {
  const path = normalizeToPath(url)

  // An invite link. The code is parked (lib/pendingInvite.ts) and redeemed
  // after onboarding; the tap itself just lands on the normal entry point,
  // because being invited grants nothing that isn't already free.
  const invite = path.match(/^\/p\/i\/([A-Za-z0-9]+)/)
  if (invite?.[1]) return { path: '/', inviteCode: invite[1] }

  // Password reset and email verification. The API serves these as real web
  // pages under /p (apps/api/src/routes/auth-pages.ts) so the emailed link
  // works for someone without the app, on any device. Someone who HAS the app
  // should get the native screen instead — same token, so carry the query
  // string across verbatim.
  const authPage = path.match(/^\/p\/(reset-password|verify-email)(\?.*)?$/)
  if (authPage?.[1]) return { path: `/${authPage[1]}${authPage[2] ?? ''}` }

  const spot = path.match(/^\/p\/spot\/([\w-]+)/)
  if (spot?.[1]) return { path: `/r/${spot[1]}` }

  // Shared profiles address people by @handle; every in-app profile route is
  // keyed by id, so this hands off to a resolver route.
  const member = path.match(/^\/p\/u\/@?([\w.-]+)/)
  if (member?.[1]) return { path: `/u/handle/${member[1]}` }

  return null
}
