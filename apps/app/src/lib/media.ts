// Cloudinary + MapBox helpers. Both are env-gated: with no key configured they
// return null and the UI shows a graceful branded fallback, so the app runs
// fully in the browser during development (same pattern as the auth providers).

const CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined
const MAPBOX = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

// A cover image URL. Local/absolute paths (the seed's /restaurants/*.jpg, or a
// full https URL) are served as-is; a bare Cloudinary public id is expanded into
// a delivery URL with auto format/quality + a fill crop when a cloud is set.
export function cloudinaryUrl(
  publicId: string | null | undefined,
  opts: { w?: number; h?: number } = {},
): string | null {
  if (!publicId) return null
  // Full URLs, local seed paths, and inline data URLs (dish posts in dev) pass
  // through untouched; only a bare Cloudinary public id gets expanded.
  if (publicId.startsWith('/') || publicId.startsWith('http') || publicId.startsWith('data:')) {
    return publicId
  }
  if (!CLOUD) return null
  const { w = 800, h = 460 } = opts
  return `https://res.cloudinary.com/${CLOUD}/image/upload/c_fill,w_${w},h_${h},q_auto,f_auto/${publicId}`
}

// The MapBox stock style backing each Mesa theme. Paired with --map-tint in
// tokens.css (which pushes the result toward Mesa) — change one, change both.
export const MAP_STYLE_ID = { afternoon: 'light-v11', candlelit: 'dark-v11' } as const
export type MapTheme = keyof typeof MAP_STYLE_ID

// A static MapBox map image (no JS library — light, works in the webview).
// `theme` picks the matching stock style: a dark map under the light Afternoon
// theme reads as a black slab dropped on paper, so this is not cosmetic.
// A brass pin marks the restaurant.
export function mapboxStaticUrl(
  lat: number,
  lng: number,
  opts: { w?: number; h?: number; zoom?: number; theme?: MapTheme } = {},
): string | null {
  if (!MAPBOX) return null
  const { w = 700, h = 260, zoom = 15, theme = 'candlelit' } = opts
  const pin = `pin-l+c09050(${lng},${lat})`
  return `https://api.mapbox.com/styles/v1/mapbox/${MAP_STYLE_ID[theme]}/static/${pin}/${lng},${lat},${zoom}/${w}x${h}@2x?access_token=${MAPBOX}`
}
