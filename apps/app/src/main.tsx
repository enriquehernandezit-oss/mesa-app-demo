import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { NavChooserSheet } from './components/NavChooserSheet'
import { Toaster } from './components/ui/Toast'
import './styles/fonts'
import './styles/tokens.css'
import './styles/global.css'
import { queryClient } from './lib/query'
import { registerServiceWorker } from './lib/sw'
import { initTheme } from './styles/theme'

// Re-sync the theme (the inline boot script already set it for first paint) and
// wire the OS-change listener for Auto.
initTheme()
registerServiceWorker()

const root = document.getElementById('root')
if (!root) throw new Error('root element missing')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster />
      <NavChooserSheet />
    </QueryClientProvider>
  </StrictMode>,
)
