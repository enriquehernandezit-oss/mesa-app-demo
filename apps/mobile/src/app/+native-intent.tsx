import { toAppPath } from '@/lib/deepLinks'
import { setPendingInvite } from '@/lib/pendingInvite'

// Universal links land here before the router sees them. Mesa's share links are
// public WEB pages (`/p/spot/:id`, `/p/u/:handle` — served by the API for
// crawlers and people without the app), but a member who taps a friend's link
// should get the app, on the real screen, not a web page in Safari.
//
// The actual rewriting lives in lib/deepLinks.ts (a pure function, unit tested
// there) because expo-router hands this `path` as the FULL launch/resume URL,
// not a bare path — see that file's header comment for why a naive regex here
// used to be dead code. This file stays a thin wrapper: parse, park an invite
// code as a side effect if present, and rewrite — or pass the ORIGINAL input
// through untouched when nothing matches.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const result = toAppPath(path)
  if (!result) return path

  if (result.inviteCode) void setPendingInvite(result.inviteCode)
  return result.path
}
