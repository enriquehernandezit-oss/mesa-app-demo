import { SaveFormat, manipulateAsync } from 'expo-image-manipulator'

// Resize a picked image to a JPEG data URL. Shared by the avatar picker (square)
// and dish posts (fit to max edge). Keeps uploads small for DR mobile networks;
// the API's /dishes endpoint takes the data URL directly in dev, and in prod the
// same resized blob is what a signed Cloudinary upload would send. Ported from
// apps/app/src/lib/image.ts, which used a <canvas>; native uses
// expo-image-manipulator (the picker gives us width/height so we pick the axis
// to fit).
//
// The capture-time grain treatment (a CSS filter on web) is NOT applied here —
// it becomes a Cloudinary delivery transform in prod, so the chosen grain is
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
  const res = await manipulateAsync(uri, actions, {
    compress: quality,
    format: SaveFormat.JPEG,
    base64: true,
  })
  return `data:image/jpeg;base64,${res.base64}`
}
