import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { api } from './api'

// Push notifications (M17). Permission is asked contextually — never at
// launch — so every call site below is triggered from a specific moment
// (the rank finish screen, a new plan, the Activity header), not a splash
// effect. See docs' own note: the simulator has no push credential, so
// Device.isDevice guards every real call here.

const TOKEN_KEY = 'mesa.push_token'

// A notification arriving while the app is open still banners + sounds —
// a friend's cheer shouldn't go silent just because you happen to be in the
// app when it lands.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

async function cachedToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY)
  } catch {
    return null
  }
}

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported'

// Read-only — never prompts. Used by app/notificaciones.tsx to decide
// between showing the 4 switches and an "Abrir Ajustes" nudge.
export async function pushPermissionStatus(): Promise<PushPermission> {
  if (!Device.isDevice) return 'unsupported'
  const { status } = await Notifications.getPermissionsAsync()
  return status
}

// The one function every contextual prompt calls. If permission is already
// granted, this just (re-)registers the token — cheap, safe to call often.
// If it's undetermined, it prompts. If it was already denied, it does
// nothing (re-prompting a denied permission is a no-op on iOS anyway; the
// only way back is Settings, which notificaciones.tsx links to).
export async function registerForPush(): Promise<boolean> {
  if (!Device.isDevice) return false

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
