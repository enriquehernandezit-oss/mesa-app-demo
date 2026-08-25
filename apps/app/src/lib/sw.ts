// Registers the app-shell service worker (public/sw.js) so the installed
// PWA isn't a dead screen offline. Production only — a SW in dev would cache
// Vite's dev-server responses and fight HMR.
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Best-effort: the app works fully online without it.
    })
  })
}
