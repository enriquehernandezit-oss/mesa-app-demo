import * as SecureStore from 'expo-secure-store'

// An invite code captured from the link that opened the app, held until there's
// an account to attribute it to.
//
// The gap this bridges: someone taps a friend's /p/i/CODE link, the app opens on
// sign-in, and by the time they finish onboarding the URL is long gone. So the
// code is parked here (survives the app being killed mid-signup) and redeemed
// once, right after onboarding completes.
//
// Deliberately best-effort at every step: a lost code costs an attribution
// datapoint, never an account and never access. Nothing in Mesa is gated on
// having been invited (see packages/db/src/schema/growth.ts).
//
// Known limitation, worth stating plainly: if the app is NOT installed, the tap
// opens the web page and the code cannot survive the App Store round trip —
// that needs deferred deep linking, which is a whole system. Attribution
// therefore undercounts installs from cold links, and over-represents people who
// already had Mesa. Read k-factor with that in mind until it's addressed.
const KEY = 'mesa.pending_invite'

export async function setPendingInvite(code: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, code.toUpperCase())
  } catch {
    // Ignored on purpose — see above.
  }
}

export async function takePendingInvite(): Promise<string | null> {
  try {
    const code = await SecureStore.getItemAsync(KEY)
    // Read-and-clear: one attribution attempt per captured code, so a failed
    // redeem can't retry forever against a code the server already rejected.
    if (code) await SecureStore.deleteItemAsync(KEY)
    return code
  } catch {
    return null
  }
}
