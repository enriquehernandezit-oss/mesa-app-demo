import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The deployed API — see docs/DEPLOY.md. Used only as the dev-proxy target
// below; the app itself still reads VITE_API_URL (set to /api-proxy in .env).
const API_ORIGIN = 'https://mesaapi-production-f9d1.up.railway.app'

// M0: bootable Vite + React shell. Milestone 2 adds TanStack Router + Query,
// the Better Auth client, the DESIGN.md theme tokens, and Capacitor.
export default defineConfig({
  // basicSsl serves the dev server over HTTPS with a self-signed cert — needed
  // so a phone testing across the LAN can receive the API's Secure session
  // cookie at all (browsers refuse to store a Secure cookie on a plain-HTTP
  // response, proxied or not). The phone will show a "not private" warning
  // once; that's the self-signed cert, expected in dev.
  plugins: [react(), basicSsl()],
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
})
