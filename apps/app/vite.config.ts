import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// M0: bootable Vite + React shell. Milestone 2 adds TanStack Router + Query,
// the Better Auth client, the DESIGN.md theme tokens, and Capacitor.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
})
