import { router } from 'expo-router'

// Hands a freshly-picked photo to app/photo-edit.tsx and awaits the crop+
// rotate result (M6) — the same imperative-await shape as lib/actionSheet.ts's
// showActionSheet and components/ui/Sheet.tsx's showSheet, but backed by a
// real pushed screen instead of a root-mounted overlay: two of this app's own
// three pickers (dish composer, rank flow) already run inside an
// already-presented native modal, and Sheet.tsx's own header comment explains
// why a JS-root overlay can't stack above that — a native modal-on-modal push
// doesn't have the problem. The screen resolves via finishPhotoEdit, however
// it goes away (Use Photo, the X, swipe-to-dismiss, Android back).
export type PendingPhotoEdit = {
  uri: string
  maxEdge: number
  quality: number
  // Preview-only: masks the frame circular for the avatar, which the Avatar
  // component itself display-crops to a circle (border-radius, not a
  // pre-cropped file) — see components/ui/Avatar.tsx. The stored image and
  // the crop math are identical either way; this never reaches ImageManipulator.
  shape: 'square' | 'circle'
}

let pending: PendingPhotoEdit | null = null
let resolveEdit: ((uri: string | null) => void) | null = null

export function getPendingPhotoEdit(): PendingPhotoEdit | null {
  return pending
}

// Returns the edited photo's local file URI, or null if the member backed out.
export function editPhoto(
  uri: string,
  opts: { maxEdge: number; quality?: number; shape?: 'square' | 'circle' },
): Promise<string | null> {
  pending = {
    uri,
    maxEdge: opts.maxEdge,
    quality: opts.quality ?? 0.8,
    shape: opts.shape ?? 'square',
  }
  router.push('/photo-edit')
  return new Promise((resolve) => {
    resolveEdit = resolve
  })
}

// Called exactly once by the screen, from whichever exit path fires first.
export function finishPhotoEdit(uri: string | null) {
  pending = null
  resolveEdit?.(uri)
  resolveEdit = null
}
