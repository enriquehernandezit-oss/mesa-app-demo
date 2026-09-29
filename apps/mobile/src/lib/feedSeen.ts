import * as SecureStore from 'expo-secure-store'

// The Feed's "You're caught up · older below" divider needs to know how far the member
// had read the last time they left it: the newest ranking they were shown. It lives in
// SecureStore (there is no localStorage on native) and is read ONCE when the Feed
// opens, so the divider stays put while they scroll — it only moves the next visit.
const KEY = 'mesa.feed_seen'

export async function readFeedSeen(): Promise<string | null> {
  try {
    return (await SecureStore.getItemAsync(KEY)) || null
  } catch {
    return null
  }
}

// Only ever moves forward: leaving after a pull-to-refresh that found nothing newer
// must not drag the watermark back.
export async function writeFeedSeen(newest: string, current: string | null): Promise<void> {
  if (current && new Date(current).getTime() >= new Date(newest).getTime()) return
  try {
    await SecureStore.setItemAsync(KEY, newest)
  } catch {
    // best effort — the divider just doesn't advance
  }
}
