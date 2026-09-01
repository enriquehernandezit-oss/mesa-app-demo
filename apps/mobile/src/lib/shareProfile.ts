import { Share } from 'react-native'
import { apiOrigin } from './api'

// The public profile link — the growth loop's return path. Falls back to the
// app origin for a member without a handle. Ported from apps/app/src/lib/
// shareProfile.ts (navigator.share → RN Share).
export function profileShareLink(handle: string | null | undefined): string {
  return handle ? `${apiOrigin}/p/u/${handle}` : apiOrigin
}

export function profileShareText(handle: string | null | undefined): string {
  return `Mi ranking en Mesa 🥂\n${profileShareLink(handle)}`
}

// The own-profile top bar's share button — the native share sheet with the
// caption. (The Rankings tab shares an image instead, via the share card, but
// reuses this caption.)
export async function shareProfile(handle: string | null | undefined): Promise<void> {
  await Share.share({ message: profileShareText(handle) }).catch(() => {})
}
