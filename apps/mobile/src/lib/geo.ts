import * as Location from 'expo-location'

import { type LatLng, haversineM } from './haversine'
import { getLanguage } from './i18n'

export { type LatLng, haversineM }

// "350 m" / "1,2 km" in Spanish (decimal comma), "350 m" / "1.2 km" in English.
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  const km = (meters / 1000).toFixed(1)
  return `${getLanguage() === 'en' ? km : km.replace('.', ',')} km`
}

const POSITION_TIMEOUT_MS = 10_000

// The device position via expo-location (was @capacitor/geolocation). Requests
// foreground permission first — only ever reached from a tap (the rank flow's
// "Cerca" chip), so the prompt is expected. Low accuracy is plenty for "which
// spot is closer" and keeps the prompt from implying GPS-grade tracking.
// Throws `Error('location-denied')` on denial and `Error('location-timeout')`
// on a fix that never arrives (weak signal, indoors, simulator with location
// off) — two different reasons callers need to tell apart, since only one of
// them ("go change your phone settings") is a useful thing to tell the member.
export async function getPosition(): Promise<LatLng> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  if (status !== Location.PermissionStatus.GRANTED) throw new Error('location-denied')
  const pos = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('location-timeout')), POSITION_TIMEOUT_MS),
    ),
  ])
  return { lat: pos.coords.latitude, lng: pos.coords.longitude }
}
