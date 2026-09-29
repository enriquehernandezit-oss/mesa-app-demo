import { useResolvedTheme } from './ThemeProvider'
import { LIFT } from './vars'

// Typed as the bare shadow, not ViewStyle, so it can be spread into a TextInput's
// style as well as a View's.
const DAY_LIFT = { boxShadow: LIFT }

// The warm lift under raised surfaces, or nothing at night. Put it in `style`.
export function useLift(): typeof DAY_LIFT | undefined {
  return useResolvedTheme() === 'day' ? DAY_LIFT : undefined
}
