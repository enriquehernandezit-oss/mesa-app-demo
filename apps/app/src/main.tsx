import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// M0: proves the shell boots and that @mesa/db types resolve across the
// workspace boundary. Milestone 2 replaces this with the real app.
const root = document.getElementById('root')
if (!root) throw new Error('root element missing')

createRoot(root).render(
  <StrictMode>
    <main style={{ fontFamily: 'Georgia, serif', padding: 24 }}>mesa</main>
  </StrictMode>,
)
