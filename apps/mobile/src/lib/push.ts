import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { api } from './api'

// Push notifications (M17). Permission is asked contextually — never at
// launch — so every call site below is triggered from a specific moment
// (the rank finish screen, a new plan, the Activity header), not a splash
// effect.
//
// Every expo-notifications access goes through loadNotifications() below —
// NEVER a top-level `import * as Notifications from 'expo-notifications'`.
// Several of that package's submodules call requireNativeModule(...) at
// their OWN module-eval time (confirmed by reading its build output), which
// throws synchronously the moment anything imports the package on a binary
// that predates the founder's EAS rebuild (M17's own founder steps say this
// rebuild is required). A static import here would crash on load — and
// this file is reachable from auth-client.ts (sign-out) and the tab shell,
// so that crash previously took down the entire app, every screen, the
// moment expo-notifications (or expo-device, removed for the same reason —
// see its package.json optional-require, which some path around it doesn't
// actually catch) landed in node_modules, well before anyone had rebuilt.
// A dynamic `import()` inside a try/catch defers that failure to actual
// use, and lets it be caught.

const TOKEN_KEY = 'mesa.push_token'

type NotificationsModule = typeof import('expo-notifications')

let cached: NotificationsModule | null | undefined

async function loadNotifications(): Promise<NotificationsModule | null> {
  if (cached !== undefined) return cached
  try {
    const mod = await import('expo-notifications')
    // A successful `import()` only proves the JS module resolved — some of
    // this package's native requires happen inside function bodies, not at
    // the top of the module, so touch the native side directly here too.
    await mod.getPermissionsAsync()
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    })
    cached = mod
  } catch {
    cached = null
  }
  return cached
}

async function cachedToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY)
  } catch {
    return null
  }
}

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported'

// Read-only — never prompts. Used by app/notificaciones.tsx to decide
// between showing the 4 switches and an "Abrir Ajustes" nudge. Also reads
// 'unsupported' when the native module isn't linked yet (pre-rebuild).
export async function pushPermissionStatus(): Promise<PushPermission> {
  const Notifications = await loadNotifications()
  if (!Notifications) return 'unsupported'
  try {
    const { status } = await Notifications.getPermissionsAsync()
    return status
  } catch {
    return 'unsupported'
  }
}

// The one function every contextual prompt calls. If permission is already
// granted, this just (re-)registers the token — cheap, safe to call often.
// If it's undetermined, it prompts. If it was already denied, it does
// nothing (re-prompting a denied permission is a no-op on iOS anyway; the
// only way back is Settings, which notificaciones.tsx links to). Silently
// returns false, never throws, if expo-notifications isn't linked yet.
export async function registerForPush(): Promise<boolean> {
  const Notifications = await loadNotifications()
  if (!Notifications) return false

  try {
    const current = await Notifications.getPermissionsAsync()
    let status = current.status
    if (status === 'undetermined') {
      status = (await Notifications.requestPermissionsAsync()).status
    }
    if (status !== 'granted') return false

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      })
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    )

    const prev = await cachedToken()
    if (prev !== token) {
      await api.post('/notifications/token', { token }).catch(() => {})
      await SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => {})
    }
    return true
  } catch {
    return false
  }
}

// Sign-out and account deletion both call this — a signed-out device
// shouldn't keep receiving another session's pushes. Best-effort: a failed
// DELETE never blocks the sign-out/deletion it's attached to.
export async function unregisterPush(): Promise<void> {
  const token = await cachedToken()
  if (!token) return
  await api.del('/notifications/token', { token }).catch(() => {})
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {})
}

// The allow-listed deep links a push's `data` payload can open — matches
// exactly what apps/api/src/lib/push.ts's triggers send. Anything else is
// ignored rather than guessed at.
export function pushDeepLink(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null
  const type = data.type
  if (type === 'user' && typeof data.userId === 'string') return `/u/${data.userId}`
  if (type === 'restaurant' && typeof data.restaurantId === 'string')
    return `/r/${data.restaurantId}`
  if (type === 'plan' && typeof data.planId === 'string') return `/planes/${data.planId}`
  return null
}

// usePushRouting's cold-start check — the data payload of whatever
// notification actually launched the app, or undefined if none did / the
// native module isn't linked yet. Kept here (not in the hook) so nothing
// outside this file ever touches expo-notifications directly.
export async function lastNotificationDeepLinkData(): Promise<Record<string, unknown> | undefined> {
  const Notifications = await loadNotifications()
  if (!Notifications) return undefined
  try {
    const response = await Notifications.getLastNotificationResponseAsync()
    return response?.notification.request.content.data
  } catch {
    return undefined
  }
}

// usePushRouting's live-tap listener. Subscribes lazily (loadNotifications
// resolves async) and returns an unsubscribe that's safe to call even if
// the subscription never actually attached.
export function onNotificationTapped(
  cb: (data: Record<string, unknown> | undefined) => void,
): () => void {
  let sub: { remove: () => void } | null = null
  let cancelled = false
  loadNotifications().then((Notifications) => {
    if (!Notifications || cancelled) return
    sub = Notifications.addNotificationResponseReceivedListener((response) => {
      cb(response.notification.request.content.data)
    })
  })
  return () => {
    cancelled = true
    sub?.remove()
  }
}
