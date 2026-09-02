import { showActionSheet } from '@/lib/actionSheet'
import * as SecureStore from 'expo-secure-store'
import { Linking } from 'react-native'

// "Cómo llegar" — the chooser the web app had and the first native port dropped
// (it hardcoded Apple Maps). Picking a maps app is a preference, not a default
// someone else gets to make: in Santo Domingo plenty of people live in Waze.
//
// The last-used app is remembered and floated to the top, but the sheet ALWAYS
// shows. Remembering means not re-finding your app every time; it doesn't mean
// silently deciding for you.
//
// Universal links, not custom schemes: a phone without Waze installed opens
// waze.com instead of failing, so no option is ever a dead end.
type NavApp = 'apple' | 'google' | 'waze'

const LAST_KEY = 'mesa.directions_app'
const ORDER: NavApp[] = ['apple', 'google', 'waze']
const LABEL: Record<NavApp, string> = {
  apple: 'Apple Maps',
  google: 'Google Maps',
  waze: 'Waze',
}

function urlFor(app: NavApp, lat: number, lng: number, label?: string): string {
  const dest = `${lat},${lng}`
  if (app === 'waze') return `https://waze.com/ul?ll=${dest}&navigate=yes`
  if (app === 'google') return `https://www.google.com/maps/dir/?api=1&destination=${dest}`
  const q = label ? `&q=${encodeURIComponent(label)}` : ''
  return `https://maps.apple.com/?daddr=${dest}${q}`
}

// Module cache over SecureStore, the same shape as lib/rankExplainer.ts: the read
// is async but the sheet shouldn't wait on the Keychain twice in a session.
let cachedLast: NavApp | null = null
let loaded = false

async function lastUsed(): Promise<NavApp | null> {
  if (loaded) return cachedLast
  loaded = true
  try {
    const v = await SecureStore.getItemAsync(LAST_KEY)
    if (v === 'apple' || v === 'google' || v === 'waze') cachedLast = v
  } catch {
    // No preference — the default order stands.
  }
  return cachedLast
}

export async function openDirections(lat: number, lng: number, label?: string): Promise<void> {
  const last = await lastUsed()
  const apps = last ? [last, ...ORDER.filter((a) => a !== last)] : ORDER

  const picked = await showActionSheet({
    title: 'Cómo llegar',
    message: label,
    options: apps.map((a) => ({ label: LABEL[a] })),
  })
  if (picked === null) return

  const app = apps[picked]
  if (!app) return
  try {
    await Linking.openURL(urlFor(app, lat, lng, label))
    // Only remember an app that actually opened.
    cachedLast = app
    void SecureStore.setItemAsync(LAST_KEY, app).catch(() => {})
  } catch {
    // The link didn't open; leave the remembered app alone.
  }
}
