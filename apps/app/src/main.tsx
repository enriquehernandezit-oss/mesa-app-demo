import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { NavChooserSheet } from './components/NavChooserSheet'
import { Toaster } from './components/ui/Toast'
import './styles/fonts'
import './styles/tokens.css'
import './styles/global.css'
import { initToken } from './lib/auth-token'
import { queryClient } from './lib/query'
import { registerServiceWorker } from './lib/sw'
import { initTheme } from './styles/theme'

// Re-sync the theme (the inline boot script already set it for first paint) and
// wire the OS-change listener for Auto.
initTheme()
registerServiceWorker()

const root = document.getElementById('root')
if (!root) throw new Error('root element missing')

// The session token now lives in Capacitor Preferences, whose read is async,
// while every consumer of it is synchronous. Fill the cache BEFORE the first
// render: rendering earlier would read an empty token and show the sign-in
// screen to somebody who is already signed in. An async bootstrap rather than
// top-level await, which esbuild refuses to transpile for this output target.
initToken().finally(() => {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster />
        <NavChooserSheet />
      </QueryClientProvider>
    </StrictMode>,
  )
})
