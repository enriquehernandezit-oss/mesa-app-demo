import '../global.css'
// Imported for its side effect and kept first: Sentry initializes at module
// scope, and it has to be in place before anything else can throw.
import '@/lib/errors'
import { ShareCardHost } from '@/components/ShareCardHost'
import { Toaster } from '@/components/ui/Toast'
import { identifyUser, initAnalytics, resetAnalytics, trackScreen } from '@/lib/analytics'
import { useSession } from '@/lib/auth-client'
import { initToken } from '@/lib/auth-token'
import { setErrorUser } from '@/lib/errors'
import { queryClient } from '@/lib/query'
import { ThemeProvider, initThemeChoice, useResolvedTheme } from '@/theme/ThemeProvider'
import { themeColors } from '@/theme/vars'
import {
  CormorantGaramond_400Regular_Italic,
  CormorantGaramond_500Medium,
  CormorantGaramond_600SemiBold,
} from '@expo-google-fonts/cormorant-garamond'
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono'
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
} from '@expo-google-fonts/plus-jakarta-sans'
import { QueryClientProvider } from '@tanstack/react-query'
import { useFonts } from 'expo-font'
import { Stack, usePathname } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useState } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

SplashScreen.preventAutoHideAsync()

// Ties events and crash reports to an account, and records screen views.
//
// It renders nothing, and it lives INSIDE QueryClientProvider on purpose:
// useSession() is a TanStack query, so this cannot be hoisted into RootLayout.
//
// Only the user id is ever sent — never a name, handle or email (see the no-PII
// contract in lib/analytics.ts). On sign-out the id is cleared and PostHog's
// distinct id is reset, so the next person on this device is a different person.
function AnalyticsIdentity() {
  const { data } = useSession()
  const userId = data?.user?.id ?? null
  const pathname = usePathname()

  useEffect(() => {
    if (userId) {
      identifyUser(userId)
      setErrorUser(userId)
    } else {
      resetAnalytics()
      setErrorUser(null)
    }
  }, [userId])

  useEffect(() => {
    // Route paths are the screen names — they carry ids (/r/:id) but no PII.
    if (pathname) trackScreen(pathname)
  }, [pathname])

  return null
}

export default function RootLayout() {
  const [loaded] = useFonts({
    CormorantGaramond_500Medium,
    CormorantGaramond_600SemiBold,
    CormorantGaramond_400Regular_Italic,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    JetBrainsMono_400Regular,
  })

  // Two Keychain reads have to land before the first frame, or the first frame is
  // a lie: the session token (else the gate flashes sign-in at a signed-in member)
  // and the theme choice (else an explicit Afternoon/Candlelit choice flashes the
  // Auto-resolved theme first). Both are bounded internally.
  const [preloaded, setPreloaded] = useState(false)
  useEffect(() => {
    // Warming the analytics client here means the first real event doesn't also
    // pay for init. No-ops without a key.
    initAnalytics()
    Promise.all([initToken(), initThemeChoice()]).finally(() => setPreloaded(true))
  }, [])

  const ready = loaded && preloaded
  useEffect(() => {
    if (ready) SplashScreen.hideAsync()
  }, [ready])

  if (!ready) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AnalyticsIdentity />
            <MesaStack />
            <Toaster />
            <ShareCardHost />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

// The navigation stack, themed. Two kinds of screen live here:
//
//   Immersive (default) — the feed, a place, a member, the maps, the compose
//   flows, auth/onboarding: `headerShown: false`, their own floating controls
//   over full-bleed content. This is how system apps handle content-first
//   screens too (an App Store product page hides its bar).
//
//   Utility — settings, activity, leaderboard, a list, legal: a REAL
//   UINavigationBar with a large title, so they get the collapse-on-scroll
//   behavior, the blur scroll edge, the system back button and its swipe for
//   free. Mesa's serif rides in via headerTitleStyle/headerLargeTitleStyle —
//   the font is the identity, the bar is the system's.
//
// Both bar and title colors follow the RESOLVED theme, which can be Candlelit
// while the OS is light (Auto flips at 6pm), so they're computed here rather
// than left to the system's light/dark guess.
function MesaStack() {
  const theme = useResolvedTheme()
  const c = themeColors[theme]
  const utility = {
    headerShown: true,
    headerLargeTitle: true,
    headerTintColor: c.accent,
    headerStyle: { backgroundColor: c.bg },
    headerLargeStyle: { backgroundColor: c.bg },
    headerBlurEffect:
      theme === 'candlelit'
        ? ('systemChromeMaterialDark' as const)
        : ('systemChromeMaterialLight' as const),
    headerShadowVisible: false,
    headerTitleStyle: { fontFamily: 'CormorantGaramond_600SemiBold', color: c.text },
    headerLargeTitleStyle: { fontFamily: 'CormorantGaramond_600SemiBold', color: c.text },
    headerBackTitle: 'Atrás',
  }
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
        // Back-swipe from anywhere on the screen, not just the left edge.
        fullScreenGestureEnabled: true,
      }}
    >
      {/* The compose flows present as sheets — the iOS pattern for "make
          something" opened from a floating action. Drag-to-dismiss runs through
          the same beforeRemove guards the back gesture does, so a half-finished
          ranking still steps backward instead of being thrown away. */}
      <Stack.Screen name="rank" options={{ presentation: 'modal' }} />
      <Stack.Screen name="dish/index" options={{ presentation: 'modal' }} />

      <Stack.Screen name="settings" options={{ ...utility, title: 'Ajustes' }} />
      <Stack.Screen name="activity" options={{ ...utility, title: 'Actividad' }} />
      <Stack.Screen name="leaderboard" options={{ ...utility, title: 'Clasificación' }} />
      {/* Moderator-only; the screen itself redirects non-moderators. */}
      <Stack.Screen name="moderation" options={{ ...utility, title: 'Moderación' }} />
      {/* Titles for these two are set by the screens themselves once the data
          (a list's name, a legal doc's name) is known. */}
      <Stack.Screen name="lists/[slug]" options={utility} />
      <Stack.Screen name="legal/[doc]" options={utility} />
    </Stack>
  )
}
