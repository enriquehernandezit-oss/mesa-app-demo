import { Linking } from 'react-native'

// Open turn-by-turn directions to a place. The web app pops a chooser sheet
// (Waze / Google / Apple — apps/app/src/lib/navChooser.ts) that remembers the
// last-used app; that multi-app sheet, with @gorhom/bottom-sheet, lands with the
// map work in N7. Until then this opens Apple Maps directly — it's always
// present on iOS, so "Cómo llegar" is a real handoff rather than a dead button.
export function openDirections(lat: number, lng: number, label?: string) {
  const q = label ? `&q=${encodeURIComponent(label)}` : ''
  Linking.openURL(`https://maps.apple.com/?daddr=${lat},${lng}${q}`).catch(() => {})
}
