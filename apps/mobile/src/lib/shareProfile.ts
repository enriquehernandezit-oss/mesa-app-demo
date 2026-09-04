import { track } from '@/lib/analytics'
import { Share } from 'react-native'
import { apiOrigin } from './api'

// The public profile link — the growth loop's return path. Falls back to the
// app origin for a member without a handle. Ported from apps/app/src/lib/
// shareProfile.ts (navigator.share → RN Share).
export function profileShareLink(handle: string | null | undefined): string {
  return handle ? `${apiOrigin}/p/u/${handle}` : apiOrigin
}

// The caption that rides with a shared list. Kept URL-free: when a share carries
// a `url` of its own, repeating it in the message shows the link twice.
export const PROFILE_SHARE_CAPTION = 'Mi ranking en Mesa 🥂'

export function profileShareText(handle: string | null | undefined): string {
  return `${PROFILE_SHARE_CAPTION}\n${profileShareLink(handle)}`
}

// The own-profile top bar's share button. The link is passed as `url`, not
// buried in the message: that's what lets iMessage (and anything else that
// unfurls) render the /p/ page's OG card instead of a line of plain text — and
// the card is the whole point of the share page existing.
export async function shareProfile(handle: string | null | undefined): Promise<void> {
  track('share_opened', { kind: 'profile' })
  await Share.share({
    message: PROFILE_SHARE_CAPTION,
    url: profileShareLink(handle),
  }).catch(() => {})
}
