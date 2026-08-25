// Mesa's app-shell + static-asset cache. Deliberately minimal — no build
// plugin, no precache manifest keyed to hashed filenames. Correctness comes
// from the strategy, not from knowing which hashes exist on this deploy:
//
//  - Navigations (HTML): network-first. A fresh deploy's hashed asset
//    references always win when online; falls back to the cached shell only
//    when the network is unavailable.
//  - Same-origin /assets/* (Vite's hashed JS/CSS/fonts, per vite.config.ts's
//    default assetsDir): cache-first, populated on first fetch. Safe because
//    the filename IS the content hash — a cached entry can never go stale
//    under its own URL, so there's no need to ever revalidate or expire one.
//  - Everything else (API calls, cross-origin, non-GET) is left alone
//    entirely. Never cache a mutating or authenticated request.
//
// Bump CACHE when this file's strategy changes; activate() flushes anything
// under the old name. Hashed assets never need busting on their own — a new
// build simply requests new filenames.
const CACHE = 'mesa-shell-v1'
const SHELL_URLS = [
  '/',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL_URLS)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

function isStaticAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/assets/')
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')))
    return
  }

  const url = new URL(request.url)
  if (!isStaticAsset(url)) return // API calls and everything cross-origin pass through untouched.

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          // The cache write is a side effect independent of the response the
          // page is waiting on — respondWith() only keeps this event alive
          // until ITS promise settles, so a bare (non-awaited) cache.put()
          // here can get killed mid-write the moment res is returned.
          // waitUntil() is what actually extends the event's lifetime for it.
          if (res.ok) {
            const copy = res.clone()
            event.waitUntil(caches.open(CACHE).then((c) => c.put(request, copy)))
          }
          return res
        }),
    ),
  )
})
