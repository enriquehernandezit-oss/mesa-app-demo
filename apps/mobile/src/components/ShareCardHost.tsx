import { ShareCard } from '@/components/ShareCard'
import { track } from '@/lib/analytics'
import { captureError } from '@/lib/errors'
import { finishShareCard, useShareCardRequest } from '@/lib/shareCardStore'
import { useEffect, useRef } from 'react'
import { Share, View } from 'react-native'
import ViewShot, { type ViewShotRef, captureRef } from 'react-native-view-shot'

// Mounted once (in _layout). When a share request is live it renders the card
// off-screen, waits for the cover image to load (ShareCard fires onReady, with a
// timeout fallback), captures it to a temp JPEG via react-native-view-shot, and
// hands the file to the native share sheet with the caption. The 1080×1920
// output size is forced regardless of the on-screen render, so the card is
// always full story resolution.
export function ShareCardHost() {
  const req = useShareCardRequest()
  const shotRef = useRef<ViewShotRef>(null)
  const done = useRef(false)

  useEffect(() => {
    done.current = false
    if (!req) return
    // Fallback: capture even if the cover's onLoad never fires (slow/broken URL).
    const t = setTimeout(() => void run(), 3000)
    return () => clearTimeout(t)
    // run is stable enough for this one-shot; req identity drives the reset.
  }, [req])

  async function run() {
    if (done.current || !req) return
    done.current = true
    try {
      const uri = await captureRef(shotRef, {
        format: 'jpg',
        quality: 0.92,
        width: 1080,
        height: 1920,
        result: 'tmpfile',
      })
      track('share_opened', { kind: req.kind })
      await Share.share({ url: uri, message: req.text })
    } catch (err) {
      // Capture or share failed / was cancelled — nothing to surface; the caller
      // only awaited "the sheet was offered". Still reported: a card that never
      // renders silently breaks the growth loop, and nobody would tell us.
      captureError(err, 'share.capture')
    } finally {
      finishShareCard()
    }
  }

  if (!req) return null
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: -10000, top: 0 }}>
      <ViewShot ref={shotRef} style={{ width: 1080, height: 1920 }}>
        <ShareCard req={req} onReady={() => void run()} />
      </ViewShot>
    </View>
  )
}
