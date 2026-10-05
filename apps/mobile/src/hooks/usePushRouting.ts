import type { useRouter } from 'expo-router'
import { useEffect } from 'react'

import { lastNotificationDeepLinkData, onNotificationTapped, pushDeepLink } from '@/lib/push'

// Routes a tapped push notification to its allow-listed screen (M17). Mounted
// once from (tabs)/_layout.tsx, which only renders once there's a session —
// a cold start from a notification tap still lands here, just after the
// splash/auth gate resolves, rather than racing it.
//
// Goes through lib/push.ts's wrappers rather than importing expo-notifications
// directly — see that file's own header for why a direct import here would
// crash this hook (and the whole tab shell) on a binary built before the
// founder's EAS rebuild.
// The notification that launched the app is acted on once per process. The tab shell mounts again
// after a sign-out and sign-in, and without this the same launch notification routed a second time.
let launchNotificationHandled = false

export function usePushRouting(router: ReturnType<typeof useRouter>): void {
  useEffect(() => {
    // The tap that actually launched the app (cold start) — checked once.
    if (!launchNotificationHandled) {
      launchNotificationHandled = true
      lastNotificationDeepLinkData().then((data) => {
        const href = pushDeepLink(data)
        if (href) router.push(href as Parameters<typeof router.push>[0])
      })
    }

    // Taps while the app is already running (foreground or backgrounded).
    const unsubscribe = onNotificationTapped((data) => {
      const href = pushDeepLink(data)
      if (href) router.push(href as Parameters<typeof router.push>[0])
    })
    return unsubscribe
  }, [router])
}
