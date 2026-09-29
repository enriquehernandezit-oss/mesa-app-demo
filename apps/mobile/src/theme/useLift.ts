import { useResolvedTheme } from './ThemeProvider'
import { FLOAT, LIFT } from './vars'

// Typed as the bare shadow, not ViewStyle, so it can be spread into a TextInput's
// style as well as a View's.
const DAY_LIFT = { boxShadow: LIFT }
const DAY_FLOAT = { boxShadow: FLOAT }

// The warm lift under raised surfaces (`card`), or the deeper one under a floating
// bar (`float`) — nothing at night. Put it in `style`.
export function useLift(kind: 'card' | 'float' = 'card'): typeof DAY_LIFT | undefined {
  if (useResolvedTheme() !== 'day') return undefined
  return kind === 'float' ? DAY_FLOAT : DAY_LIFT
}
