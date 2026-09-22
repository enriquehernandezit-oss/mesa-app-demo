import { apiOrigin } from '@/lib/api'
// MapBox helper (image URLs live below too, hence the file name). MapBox is
// env-gated: with no token configured it returns null and the UI shows a
// graceful branded fallback, so the app runs fully in the browser during
// development (same pattern as the auth providers).

const MAPBOX = process.env.EXPO_PUBLIC_MAPBOX_TOKEN as string | undefined

// A cover/dish/avatar image URL. `opts` is accepted for call-site symmetry
// with the old Cloudinary transform API but unused — R2 serves whatever size
// was uploaded (lib/upload.ts already resizes client-side before upload); a
// later Cloudflare Images/transform step could reintroduce `opts` without
// touching any call site.
export function imageUrl(
  ref: string | null | undefined,
  _opts: { w?: number; h?: number } = {},
): string | null {
  if (!ref) return null
  // A full URL — an R2 upload (the common case now), or any legacy value
  // already stored — passes through as-is.
  if (ref.startsWith('http') || ref.startsWith('data:')) return ref
  // Root-relative seed paths ("/restaurants/branzino.jpg") used to resolve
  // against the web app's origin. Native has no origin, so they'd be unloadable
  // URIs — the API serves these files now (see apps/api/src/index.ts), so
  // resolve them against it.
  if (ref.startsWith('/')) return `${apiOrigin}${ref}`
  return null
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
