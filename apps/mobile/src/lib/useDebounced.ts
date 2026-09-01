import { useEffect, useState } from 'react'

// Returns `value` delayed by `delayMs` — it only updates once the input has been
// still for that long. Holds off a paid Google Places request until the member
// pauses typing (M8). Ported verbatim from apps/app/src/lib/useDebounced.ts.
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}
