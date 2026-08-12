// The capture-time grain treatment as a CSS filter. In prod this becomes a
// Cloudinary delivery transform; in dev we apply it on render.
export function filterForGrain(grain: string | null | undefined): string {
  switch (grain) {
    case 'candlelit':
      return 'sepia(0.22) saturate(1.18) contrast(1.05) brightness(0.95)'
    case 'daylight':
      return 'saturate(1.1) brightness(1.05) contrast(1.02)'
    default:
      return 'none'
  }
}

// Resize a picked image file to a JPEG data URL. Shared by the avatar picker
// (square) and dish posts (fit to max edge). Keeps uploads small for DR mobile
// networks; in dev (no Cloudinary) the data URL is stored directly, and in prod
// the same resized blob is what a signed Cloudinary upload would send.
export async function resizeToJpeg(
  file: File,
  opts: { maxEdge: number; square?: boolean; quality?: number },
): Promise<string> {
  const { maxEdge, square = false, quality = 0.8 } = opts
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas unsupported')
    if (square) {
      canvas.width = maxEdge
      canvas.height = maxEdge
      const s = Math.max(maxEdge / img.width, maxEdge / img.height)
      ctx.drawImage(
        img,
        (maxEdge - img.width * s) / 2,
        (maxEdge - img.height * s) / 2,
        img.width * s,
        img.height * s,
      )
    } else {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    }
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}
