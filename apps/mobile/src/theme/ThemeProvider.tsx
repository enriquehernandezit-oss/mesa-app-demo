import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react'
import { AppState, Appearance, View } from 'react-native'
import { GROUND, type ThemeName, themeVars } from './vars'

// Theme resolution, ported from apps/app/src/styles/theme.ts. Two themes plus
// Auto, which follows the OS AND the clock — Mesa is a going-out app, so Auto
// reads as evening energy once it actually is evening, not only when the OS is
// in dark mode. The web version persisted the choice in localStorage for a
// synchronous first paint; on native there's no FOUC to avoid, so persistence
// of the choice moves to the ThemePicker (N9). Default is Auto.

export type ThemeChoice = 'auto' | 'afternoon' | 'candlelit'

const EVENING_START_HOUR = 18
const MORNING_END_HOUR = 6

function isEvening(now = new Date()): boolean {
  const h = now.getHours()
  return h >= EVENING_START_HOUR || h < MORNING_END_HOUR
}

function resolve(choice: ThemeChoice): ThemeName {
  if (choice === 'afternoon' || choice === 'candlelit') return choice
  const osDark = Appearance.getColorScheme() === 'dark'
  return osDark || isEvening() ? 'candlelit' : 'afternoon'
}

// The next 6am/6pm boundary strictly after now — mirrors theme.ts.nextBoundary.
function msToNextBoundary(now = new Date()): number {
  const morning = new Date(now)
  morning.setHours(MORNING_END_HOUR, 0, 0, 0)
  if (now < morning) return morning.getTime() - now.getTime()
  const evening = new Date(now)
  evening.setHours(EVENING_START_HOUR, 0, 0, 0)
  if (now < evening) return evening.getTime() - now.getTime()
  const tomorrow = new Date(morning)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow.getTime() - now.getTime()
}

type ThemeContextValue = {
  choice: ThemeChoice
  resolved: ThemeName
  setChoice: (c: ThemeChoice) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<ThemeChoice>('auto')
  const [resolved, setResolved] = useState<ThemeName>(() => resolve('auto'))

  // Re-resolve whenever the choice changes, the OS scheme flips, the app returns
  // to the foreground, or the clock crosses 6am/6pm — but only the last two
  // matter while Auto is active, matching the web's "track system + clock only
  // while Auto" behavior.
  useEffect(() => {
    setResolved(resolve(choice))
    if (choice !== 'auto') return

    const osSub = Appearance.addChangeListener(() => setResolved(resolve('auto')))
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setResolved(resolve('auto'))
    })
    let timer: ReturnType<typeof setTimeout>
    const arm = () => {
      timer = setTimeout(() => {
        setResolved(resolve('auto'))
        arm()
      }, msToNextBoundary())
    }
    arm()
    return () => {
      osSub.remove()
      appSub.remove()
      clearTimeout(timer)
    }
  }, [choice])

  const value = useMemo<ThemeContextValue>(
    () => ({ choice, resolved, setChoice }),
    [choice, resolved],
  )

  return (
    <ThemeContext.Provider value={value}>
      <View style={[themeVars[resolved], { flex: 1, backgroundColor: GROUND[resolved] }]}>
        {children}
      </View>
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}

// Read-only convenience mirroring the web hook, for surfaces that must pick an
// asset by theme (e.g. a MapBox static image's light-v11 vs dark-v11).
export function useResolvedTheme(): ThemeName {
  return useTheme().resolved
}
