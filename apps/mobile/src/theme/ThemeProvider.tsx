import * as SecureStore from 'expo-secure-store'
import { StatusBar } from 'expo-status-bar'
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react'
import { AppState, Appearance, View } from 'react-native'
import { GROUND, type ThemeName, themeVars } from './vars'

// Theme resolution, ported from apps/app/src/styles/theme.ts. Two themes plus
// Auto, which follows the OS AND the clock — Mesa is a going-out app, so Auto
// reads as evening energy once it actually is evening, not only when the OS is
// in dark mode.
//
// The saved choice is read from SecureStore BEFORE the first frame: initThemeChoice()
// resolves in the root layout's splash gate (same shape as initToken()), and the
// provider seeds from that cache synchronously. Reading it after mount instead —
// which is what this did — meant anyone with an explicit choice got a frame of the
// wrong theme on every cold start: pick Afternoon and open the app at 9pm and Auto
// painted Candlelit first, then snapped. A first-time member still starts on Auto.

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

const CHOICE_KEY = 'mesa.theme_choice'

function isChoice(v: string | null): v is ThemeChoice {
  return v === 'auto' || v === 'afternoon' || v === 'candlelit'
}

let cachedChoice: ThemeChoice = 'auto'

// Awaited by the root layout before it lets the first frame through. Bounded, for
// the same reason initToken() is: a stuck native bridge must cost one wrong-theme
// frame, never a permanently blank app.
export async function initThemeChoice(): Promise<void> {
  try {
    const read = SecureStore.getItemAsync(CHOICE_KEY)
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), 3000))
    const v = await Promise.race([read, timeout])
    if (isChoice(v)) cachedChoice = v
  } catch {
    // Keep Auto.
  }
}

// The resolved theme for imperative, non-React callers — system surfaces that are
// created outside the tree (action sheets, alerts) still have to match the theme
// Mesa is actually painting, which can be Candlelit while the OS is light.
let currentResolved: ThemeName = resolve('auto')
export function getResolvedTheme(): ThemeName {
  return currentResolved
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Seeded from the cache initThemeChoice() filled during the splash gate, so the
  // first frame is already the right theme.
  const [choice, setChoiceState] = useState<ThemeChoice>(cachedChoice)

  // Fire-and-forget persistence: the in-memory choice is what renders, and a
  // failed write must never break the tap that made it.
  const setChoice = useMemo(
    () => (c: ThemeChoice) => {
      setChoiceState(c)
      void SecureStore.setItemAsync(CHOICE_KEY, c).catch(() => {})
    },
    [],
  )
  const [resolved, setResolved] = useState<ThemeName>(() => resolve(cachedChoice))

  // Re-resolve whenever the choice changes, the OS scheme flips, the app returns
  // to the foreground, or the clock crosses 6am/6pm — but only the last two
  // matter while Auto is active, matching the web's "track system + clock only
  // while Auto" behavior.
  useEffect(() => {
    const next = resolve(choice)
    currentResolved = next
    setResolved(next)
    if (choice !== 'auto') return

    const reresolve = () => {
      const n = resolve('auto')
      currentResolved = n
      setResolved(n)
    }
    const osSub = Appearance.addChangeListener(reresolve)
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') reresolve()
    })
    let timer: ReturnType<typeof setTimeout>
    const arm = () => {
      timer = setTimeout(() => {
        reresolve()
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
    [choice, resolved, setChoice],
  )

  return (
    <ThemeContext.Provider value={value}>
      {/* The bar follows MESA's theme, not the OS's: `style="auto"` would read the
          system scheme and get it wrong every evening, since Auto turns Candlelit
          at 6pm on a light-mode phone. */}
      <StatusBar style={resolved === 'candlelit' ? 'light' : 'dark'} animated />
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
