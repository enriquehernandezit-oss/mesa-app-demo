import { SaveFormat, manipulateAsync } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'

// Resize a picked image to a local JPEG file, ready for both an instant local
// preview (`<Image source={{ uri }}>` renders a file:// URI directly, no
// decoding step) and lib/upload.ts's R2 upload. Shared by the avatar picker
// (square) and dish posts (fit to max edge) — keeps the actual transfer small
// for DR mobile networks. Ported from apps/app/src/lib/image.ts, which used a
// <canvas>; native uses expo-image-manipulator (the picker gives us
// width/height so we pick the axis to fit).
//
// The capture-time grain treatment (a CSS filter on web) is NOT applied here —
// it becomes a delivery-time transform once one exists, so the chosen grain is
// sent to the API as a field and the photo shows untreated until then.
export async function resizeToJpeg(
  uri: string,
  width: number,
  height: number,
  opts: { maxEdge: number; square?: boolean; quality?: number },
): Promise<string> {
  const { maxEdge, square = false, quality = 0.8 } = opts
  const actions = []
  if (square) {
    const side = Math.min(width, height)
    actions.push({
      crop: {
        originX: (width - side) / 2,
        originY: (height - side) / 2,
        width: side,
        height: side,
      },
    })
    actions.push({ resize: { width: maxEdge, height: maxEdge } })
  } else if (width >= height) {
    actions.push({ resize: { width: Math.min(width, maxEdge) } })
  } else {
    actions.push({ resize: { height: Math.min(height, maxEdge) } })
  }
  const res = await manipulateAsync(uri, actions, { compress: quality, format: SaveFormat.JPEG })
  return res.uri
}

export type PickedImage =
  | { status: 'picked'; asset: ImagePicker.ImagePickerAsset }
  | { status: 'cancelled' }
  | { status: 'denied' }

// Request the matching permission, then launch camera or library. Shared by
// the dish-photo flow (lib/dishPhoto.ts) and the avatar picker
// ((tabs)/profile.tsx) — 'denied' is modeled separately from 'cancelled' so a
// caller can tell "nothing happened because you said no" from "you backed
// out" and point the user at Settings for the former.
export async function openImagePicker(
  source: 'camera' | 'library',
  opts?: { square?: boolean },
): Promise<PickedImage> {
  const perm =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) return { status: 'denied' }
  const launchOpts = { mediaTypes: ['images' as const], quality: 1, allowsEditing: opts?.square }
  const res =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(launchOpts)
      : await ImagePicker.launchImageLibraryAsync(launchOpts)
  if (res.canceled) return { status: 'cancelled' }
  return { status: 'picked', asset: res.assets[0] }
}
