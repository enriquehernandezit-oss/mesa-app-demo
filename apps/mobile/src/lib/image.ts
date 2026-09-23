import * as ImagePicker from 'expo-image-picker'

export type PickedImage =
  | { status: 'picked'; asset: ImagePicker.ImagePickerAsset }
  | { status: 'cancelled' }
  | { status: 'denied' }

// Request the matching permission, then launch camera or library. Shared by
// the dish-photo flow (lib/dishPhoto.ts) and the avatar picker
// ((tabs)/profile.tsx) — 'denied' is modeled separately from 'cancelled' so a
// caller can tell "nothing happened because you said no" from "you backed
// out" and point the user at Settings for the former. No `allowsEditing`
// here (that was the OS's own crop step): both callers now send the result
// straight into lib/photoEditor.ts's editPhoto() instead, one crop/rotate UI
// for both instead of a native crop here plus a force-center-crop after it.
export async function openImagePicker(source: 'camera' | 'library'): Promise<PickedImage> {
  const perm =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) return { status: 'denied' }
  const launchOpts = { mediaTypes: ['images' as const], quality: 1 }
  const res =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(launchOpts)
      : await ImagePicker.launchImageLibraryAsync(launchOpts)
  if (res.canceled) return { status: 'cancelled' }
  return { status: 'picked', asset: res.assets[0] }
}
