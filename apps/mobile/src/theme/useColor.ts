import { useResolvedTheme } from './ThemeProvider'
import { type ColorToken, themeColors } from './vars'

// A semantic color as a hex/rgba VALUE for the active theme — for the few places
// className can't reach (react-native-svg strokes/fills, imperative APIs).
// Anything that can be styled with a className should use one instead.
export function useColor(token: ColorToken): string {
  return themeColors[useResolvedTheme()][token]
}
