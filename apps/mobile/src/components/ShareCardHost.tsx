import { ShareCard } from '@/components/ShareCard'
import { toast } from '@/components/ui/toast-store'
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
    // The capture (and, on the 3s fallback path, the wait for it) is the only
    // part of this whole flow the tap itself doesn't give feedback for — up to
    // 3s of nothing on screen reads as a dead button. This is the one place to
    // say something: `run()` below fires exactly once per request either way.
    toast({ message: 'Preparando tu tarjeta…' })
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
        // The default iOS strategy (drawViewHierarchyInRect) is documented,
        // by view-shot's own source, as unreliable for a view this size
        // positioned off-canvas — it can report success with a blank image.
        // renderInContext (what this flips on) doesn't have that failure
        // mode. No-op on Android.
        useRenderInContext: true,
      })
      track('share_opened', { kind: req.kind })
      await Share.share({ url: uri, message: req.text })
    } catch (err) {
      // Capture or share failed. Still reported (a card that never renders
      // silently breaks the growth loop, and nobody would tell us) — and now
      // told to the person who tapped it too: a "Preparando…" toast that never
      // resolves into anything is worse than no toast at all.
      captureError(err, 'share.capture')
      toast({ variant: 'error', message: 'No se pudo preparar la tarjeta. Intenta de nuevo.' })
    } finally {
      finishShareCard()
    }
  }

  if (!req) return null
  return (
    // On-screen, not off-canvas (was left: -10000): a view positioned outside
    // the visible bounds is exactly the case view-shot's own docs warn can
    // capture blank. opacity: 0 + pointerEvents="none" keeps it invisible and
    // untouchable without moving it out of the render tree's real geometry.
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, opacity: 0 }}>
      <ViewShot ref={shotRef} style={{ width: 1080, height: 1920 }}>
        <ShareCard req={req} onReady={() => void run()} />
      </ViewShot>
    </View>
  )
}
