import { requireOptionalNativeModule } from 'expo'
import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { api } from './api'

export { pushDeepLink } from './pushLinks'

// Push notifications (M17). Permission is asked contextually — never at
// launch — so every call site below is triggered from a specific moment
// (the rank finish screen, a new plan, the Activity header), not a splash
// effect.
//
// pushNativeLinked() gates every access to expo-notifications. This is NOT
// cosmetic — it is the only thing standing between this file and a repeat
// app-wide crash. Two earlier, more clever attempts both failed in
// production:
//   1. A static `import * as Notifications from 'expo-notifications'` at
//      the top of this file — crashed immediately on any screen that
//      touched it (this file is reachable from auth-client.ts, so that
//      meant everywhere), because several of the package's submodules call
//      requireNativeModule(...) at their OWN module-eval time.
//   2. A dynamic `await import('expo-notifications')` wrapped in
//      try/catch, reasoning that Metro would only evaluate the module (and
//      its native requires) once actually awaited, and that the throw
//      would be a normal rejection a try/catch could catch. Live-confirmed
//      wrong: resolving the package's barrel file still eagerly evaluates
//      EVERY re-exported submodule (getDevicePushTokenAsync among them,
//      not something this file even calls), and Metro's import()
//      transform let that throw escape as an UNCAUGHT error instead of a
//      catchable rejection — crashed on the very first real use (Activity
//      mount) rather than at boot, which is what made it look fixed until
//      someone actually opened a push-adjacent screen.
//
// The fix that's actually safe against both failure modes: ask the native
// module registry whether the modules are there BEFORE ever importing the
// barrel, via requireOptionalNativeModule (from `expo`, not `expo-notifications`
// — it never touches that package's JS). It returns null instead of throwing
// when a module isn't linked, which is exactly what a dev client without the
// native side, or a stale local prebuild, looks like — so this reads as
// 'unsupported' everywhere below, the same as before, with no crash. Once a
// real EAS build has linked expo-notifications (app.json's plugin list already
// names it), the probe starts returning true on its own — nothing here needs
// touching by hand. Names are the ones this expo-notifications version
// registers under; re-check them on an SDK bump.
function pushNativeLinked(): boolean {
  return (
    requireOptionalNativeModule<object>('ExpoNotificationPermissionsModule') !== null &&
    requireOptionalNativeModule<object>('ExpoPushTokenManager') !== null
  )
}

const TOKEN_KEY = 'mesa.push_token'

type NotificationsModule = typeof import('expo-notifications')

let cached: NotificationsModule | null | undefined

async function loadNotifications(): Promise<NotificationsModule | null> {
  if (!pushNativeLinked()) return null
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
