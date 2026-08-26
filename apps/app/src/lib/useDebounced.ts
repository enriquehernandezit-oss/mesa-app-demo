import { useEffect, useState } from 'react'

// Returns `value` delayed by `delayMs` — it only updates once the input has been
// still for that long. Used to hold off a paid Google Places request until the
// member pauses typing (M8), so a query fires per pause, not per keystroke.
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}
