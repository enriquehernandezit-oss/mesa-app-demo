import { createHash } from 'node:crypto'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { type Plugin, defineConfig, loadEnv } from 'vite'

// The deployed API — see docs/DEPLOY.md. Used only as the dev-proxy target
// below; the app itself still reads VITE_API_URL (set to /api-proxy in .env).
const API_ORIGIN = 'https://mesaapi-production-f9d1.up.railway.app'

// Injects a Content-Security-Policy into the BUILT index.html only (dev needs
// Vite's own inline HMR client + a ws: connection, which a strict policy would
// break). The session Bearer token lives in localStorage, so connect-src is the
// load-bearing directive: even if an injected script ran, it could not POST the
// token to an attacker origin. The inline theme-boot script is allowed by its
// exact sha256 — computed here from the emitted HTML, so it can never drift out
// of sync. connect-src is derived from VITE_API_URL so it always matches
// whatever origin this build actually talks to (a full URL → its origin; the
// relative /api-proxy → same-origin, covered by 'self').
function cspPlugin(apiUrl: string): Plugin {
  let apiConnect: string | null = null
  try {
    apiConnect = new URL(apiUrl).origin
  } catch {
    apiConnect = null // relative path (/api-proxy) → same-origin
  }
  const connect = [
    "'self'",
    apiConnect,
    'https://api.mapbox.com',
    'https://*.tiles.mapbox.com',
    'https://events.mapbox.com',
  ]
    .filter(Boolean)
    .join(' ')
  const img = [
    "'self'",
    'data:',
    'blob:',
    'https://res.cloudinary.com',
    'https://api.mapbox.com',
    'https://*.tiles.mapbox.com',
  ].join(' ')

  return {
    name: 'mesa-csp',
    apply: 'build',
    transformIndexHtml: {
      // Post-order so we hash the inline script exactly as it ships.
      order: 'post',
      handler(html) {
        const inlineBody = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
        const scriptSrc = inlineBody
          ? `'self' 'sha256-${createHash('sha256').update(inlineBody).digest('base64')}'`
          : "'self'"
        const csp = [
          "default-src 'self'",
          `script-src ${scriptSrc}`,
          // React style props + mapbox-gl marker styles set inline style attrs.
          "style-src 'self' 'unsafe-inline'",
          `img-src ${img}`,
          `connect-src ${connect}`,
          "font-src 'self' data:",
          // mapbox-gl spins up web workers from blob: URLs.
          "worker-src 'self' blob:",
          "object-src 'none'",
          "base-uri 'none'",
          // frame-ancestors is intentionally omitted here: it's ignored in a
          // <meta> CSP (browsers only honor it as a response header). It ships
          // instead — with HSTS, which likewise has no meta form — from
          // apps/app/public/serve.json, which Vite copies into dist/ and the
          // static server reads from the directory it serves.
          //
          // NOTE for whoever edits serve.json next: Referrer-Policy there must
          // keep sending the origin cross-origin (strict-origin-when-cross-origin).
          // The MapBox token is URL-restricted, which is what stops it being
          // reused after someone lifts it out of this bundle — and MapBox
          // enforces that by reading the Referer. `no-referrer` sends none, so
          // every tile request 403s and the map renders as pins on a blank
          // canvas while the style and fonts still load, which makes it look
          // like a MapBox outage rather than a header change.
        ].join('; ')
        return {
          html,
          tags: [
            {
              tag: 'meta',
              attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
              injectTo: 'head-prepend',
            },
          ],
        }
      },
    },
  }
}

// M0: bootable Vite + React shell. Milestone 2 adds TanStack Router + Query,
// the Better Auth client, the DESIGN.md theme tokens, and Capacitor.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.VITE_API_URL ?? '/api-proxy'
  return {
    // basicSsl serves the dev server over HTTPS with a self-signed cert — needed
    // so a phone testing across the LAN can receive the API's Secure session
    // cookie at all (browsers refuse to store a Secure cookie on a plain-HTTP
    // response, proxied or not). The phone will show a "not private" warning
    // once; that's the self-signed cert, expected in dev.
    plugins: [react(), basicSsl(), cspPlugin(apiUrl)],
    server: {
      port: 5173,
      // host: true binds all network interfaces so a phone on the same Wi-Fi can
      // load the dev server at https://<your-mac-ip>:5173 (localhost-only otherwise).
      host: true,
      // Proxies API calls through this same-origin dev server instead of the
      // browser calling the API's own domain directly. That makes the session
      // cookie first-party from the phone's point of view, sidestepping Safari/
      // Chrome's cross-site cookie blocking entirely — no cookie attribute can
      // work around that from a genuinely cross-site request.
      proxy: {
        '/api-proxy': {
          target: API_ORIGIN,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api-proxy/, ''),
        },
      },
    },
  }
})
