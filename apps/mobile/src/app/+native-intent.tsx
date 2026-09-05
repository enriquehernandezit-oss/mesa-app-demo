import { setPendingInvite } from '@/lib/pendingInvite'

// Universal links land here before the router sees them. Mesa's share links are
// public WEB pages (`/p/spot/:id`, `/p/u/:handle` — served by the API for
// crawlers and people without the app), but a member who taps a friend's link
// should get the app, on the real screen, not a web page in Safari.
//
// So: rewrite the public path to its in-app equivalent. Anything else — the
// password-reset and verify-email links — passes through to its own route
// untouched.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  // An invite link. The code is parked (see lib/pendingInvite.ts) and redeemed
  // after onboarding; the tap itself just lands on the normal entry point,
  // because being invited grants nothing that isn't already free.
  const invite = path.match(/^\/p\/i\/([A-Za-z0-9]+)/)
  if (invite?.[1]) {
    void setPendingInvite(invite[1])
    return '/'
  }

  const spot = path.match(/^\/p\/spot\/([\w-]+)/)
  if (spot?.[1]) return `/r/${spot[1]}`

  // Shared profiles address people by @handle; every in-app profile route is
  // keyed by id, so this hands off to a resolver route.
  const member = path.match(/^\/p\/u\/@?([\w.-]+)/)
  if (member?.[1]) return `/u/handle/${member[1]}`

  return path
}
