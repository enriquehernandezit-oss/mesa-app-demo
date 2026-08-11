import type { CapacitorConfig } from '@capacitor/cli'

// Capacitor wraps the same Vite build as the iOS/Android app. The native
// projects (ios/, android/) are generated with `bun run cap:add:ios` /
// `cap:add:android` once the platform toolchains are installed (Xcode / Android
// Studio) — see docs/NATIVE.md. Until then the app runs in the browser via Vite,
// which is how M2–M4 are verified.
const config: CapacitorConfig = {
  appId: 'com.mesa.app',
  appName: 'Mesa',
  // Vite's production output. `cap sync` copies this into the native shells.
  webDir: 'dist',
  ios: {
    // Afternoon (paper) is the default theme — match its --bg so there's no
    // flash before the web layer paints. A Candlelit user gets a sub-100ms light
    // flash on cold start; that's an accepted trade-off (per-user needs native
    // code). Keep in sync with --bg in src/styles/tokens.css and index.html.
    backgroundColor: '#f3efe6',
  },
  android: {
    backgroundColor: '#f3efe6',
  },
}

export default config
