import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/fonts'
import './styles/tokens.css'
import './styles/global.css'
import { queryClient } from './lib/query'
import { initTheme } from './styles/theme'

// Re-sync the theme (the inline boot script already set it for first paint) and
// wire the OS-change listener for Auto.
initTheme()

const root = document.getElementById('root')
if (!root) throw new Error('root element missing')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
