import { track } from '@/lib/analytics'
import { Linking, Share } from 'react-native'
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

export function inviteShareLink(code: string): string {
  return `${apiOrigin}/p/i/${code}`
}

// Sharing an invite. WhatsApp goes first because that is where Santo Domingo
// actually plans dinner — the reservation layer here is a DM, not OpenTable —
// so the loop should land in the group chat rather than asking someone to pick
// a channel. The system sheet stays the fallback for everyone else, and for a
// phone with no WhatsApp installed.
export async function shareInviteLink(code: string): Promise<void> {
  track('share_opened', { kind: 'invite' })
  const link = inviteShareLink(code)
  const text = `Te invito a Mesa 🥂 — donde comemos y salimos en Santo Domingo.\n${link}`

  const wa = `whatsapp://send?text=${encodeURIComponent(text)}`
  const canWhatsApp = await Linking.canOpenURL(wa).catch(() => false)
  if (canWhatsApp) {
    // openURL can still reject (WhatsApp mid-update, permissions) — fall through
    // to the sheet rather than leaving the tap doing nothing.
    const opened = await Linking.openURL(wa).then(
      () => true,
      () => false,
    )
    if (opened) return
  }

  await Share.share({ message: text }).catch(() => {})
}
