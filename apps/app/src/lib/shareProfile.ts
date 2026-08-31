import { apiOrigin } from './api'

// The public profile link — the growth loop's return path. Falls back to the
// app origin for a member who hasn't claimed a handle yet. Shared by the two
// profile top bars and the shareable ranking card so the URL shape lives once.
export function profileShareLink(handle: string | null | undefined): string {
  return handle ? `${apiOrigin}/p/u/${handle}` : apiOrigin
}

// The caption used wherever a member shares their list.
export function profileShareText(handle: string | null | undefined): string {
  return `Mi ranking en Mesa 🥂\n${profileShareLink(handle)}`
}

// Native share sheet with a clipboard fallback — the own-profile top bars' share
// button. (The Rankings tab shares an image instead, via shareCard, but reuses
// the same caption through profileShareText.)
export async function shareProfile(handle: string | null | undefined): Promise<void> {
  if (navigator.share) await navigator.share({ text: profileShareText(handle) }).catch(() => {})
  else await navigator.clipboard.writeText(profileShareLink(handle)).catch(() => {})
}
