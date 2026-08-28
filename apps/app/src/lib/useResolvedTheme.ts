import { useSyncExternalStore } from 'react'
import type { ResolvedTheme } from '../styles/theme'

// The currently-applied theme, as a React value. styles/theme.ts owns the
// resolution (choice + OS + clock) and writes the answer to <html data-theme>;
// this just lets a component READ it and re-render when it flips.
//
// Needed because a MapBox static image is a URL, not a styled element — CSS
// can't restyle it, so the component has to pick light-v11 vs dark-v11 itself.
// Anything that can be themed in CSS should be, and should not use this.
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
  return () => observer.disconnect()
}

function getSnapshot(): ResolvedTheme {
  return document.documentElement.dataset.theme === 'candlelit' ? 'candlelit' : 'afternoon'
}

export function useResolvedTheme(): ResolvedTheme {
  // Server snapshot matches the boot script's default (Afternoon) — this app
  // is a client-rendered SPA, so it only matters for the very first frame.
  return useSyncExternalStore(subscribe, getSnapshot, () => 'afternoon')
}
