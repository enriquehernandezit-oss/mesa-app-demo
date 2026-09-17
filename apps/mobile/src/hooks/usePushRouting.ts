import { pushDeepLink } from '@/lib/push'
import * as Notifications from 'expo-notifications'
import type { useRouter } from 'expo-router'
import { useEffect } from 'react'

// Routes a tapped push notification to its allow-listed screen (M17). Mounted
// once from (tabs)/_layout.tsx, which only renders once there's a session —
// a cold start from a notification tap still lands here, just after the
// splash/auth gate resolves, rather than racing it.
export function usePushRouting(router: ReturnType<typeof useRouter>): void {
  useEffect(() => {
    // The tap that actually launched the app (cold start) — checked once;
    // expo-notifications clears it after the first read.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      const href = pushDeepLink(response?.notification.request.content.data)
      if (href) router.push(href as Parameters<typeof router.push>[0])
    })

    // Taps while the app is already running (foreground or backgrounded).
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const href = pushDeepLink(response.notification.request.content.data)
      if (href) router.push(href as Parameters<typeof router.push>[0])
    })
    return () => sub.remove()
  }, [router])
}
