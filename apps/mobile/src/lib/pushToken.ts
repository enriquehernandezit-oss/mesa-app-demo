import * as SecureStore from 'expo-secure-store'

// The Expo push token this device last registered with the server, remembered so registering again
// is a no-op. Kept apart from push.ts (which imports the API client) so lib/authLost.ts can forget
// it without importing a cycle.
const TOKEN_KEY = 'mesa.push_token'

export async function cachedPushToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY)
  } catch {
    return null
  }
}

export async function rememberPushToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => {})
}

// Called whenever the session is gone: the server row for this device belongs to an account that
// can no longer be reached. Without this, the next person to sign in on the same phone found the
// token "already registered", skipped registering, and the old account kept this device's pushes
// while the new one got none.
export async function forgetPushToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {})
}
