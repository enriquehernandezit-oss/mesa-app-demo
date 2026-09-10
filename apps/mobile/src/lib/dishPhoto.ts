import { showActionSheet } from '@/lib/actionSheet'
import { captureError } from '@/lib/errors'
import { resizeToJpeg } from '@/lib/image'
import * as ImagePicker from 'expo-image-picker'

// The camera-or-library → permission → resize pipeline for a dish photo.
// Shared by the standalone dish composer (app/dish/index.tsx) and the inline
// photo step in the rank flow (app/rank.tsx) so this permission/resize/error
// handling lives in exactly one place. Returns null on cancel, denial, or any
// thrown error — callers don't need their own try/catch.
//
// Deliberately still the NATIVE chooser (lib/actionSheet.ts), not Mesa's own
// Sheet (components/ui/Sheet.tsx): both callers present as
// `presentation: 'modal'`, and on-device testing showed Sheet — a root-
// mounted JS overlay — never appears above an already-presented native
// modal (confirmed both as a plain View and wrapped in RN's own <Modal>,
// neither works nested inside another modal). ActionSheetIOS has no such
// limitation since it isn't tied to the React root's view controller.
//
// Module-level (not per-component) in-flight guard: expo-image-picker has no
// re-entrancy guard of its own — a second launch*Async call while one is
// already presenting just overwrites its pending promise, so UIKit refuses
// the duplicate present and the FIRST call's promise never resolves. A
// second call while one is already in flight returns null instead. Also
// guards the ActionSheetIOS call itself against the same present-while-
// dismissing risk the P0 fix addressed for the avatar picker.
let picking = false

export async function pickDishPhoto(): Promise<string | null> {
  if (picking) return null
  picking = true
  try {
    const picked = await showActionSheet({
      options: [{ label: 'Tomar foto' }, { label: 'Elegir de la biblioteca' }],
    })
    if (picked === null) return null
    const source = picked === 0 ? 'camera' : 'library'
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) return null
    const res =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 })
    const asset = res.canceled ? null : res.assets[0]
    if (!asset) return null
    return await resizeToJpeg(asset.uri, asset.width, asset.height, {
      maxEdge: 1280,
      quality: 0.72,
    })
  } catch (err) {
    captureError(err, 'image.pick')
    return null
  } finally {
    picking = false
  }
}
