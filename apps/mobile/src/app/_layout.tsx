import '../global.css'
import {
  CormorantGaramond_400Regular_Italic,
  CormorantGaramond_500Medium,
  CormorantGaramond_600SemiBold,
} from '@expo-google-fonts/cormorant-garamond'
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
} from '@expo-google-fonts/plus-jakarta-sans'
import { QueryClientProvider } from '@tanstack/react-query'
import { useFonts } from 'expo-font'
import { Stack, usePathname } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useMemo, useState } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { ShareCardHost } from '@/components/ShareCardHost'
import { SheetHost } from '@/components/ui/Sheet'
import { Toaster } from '@/components/ui/Toast'
import { identifyUser, initAnalytics, resetAnalytics, trackScreen } from '@/lib/analytics'
import { useSession } from '@/lib/auth-client'
import { initToken } from '@/lib/auth-token'
import { captureError, setErrorUser } from '@/lib/errors'
import { initLanguage, useT } from '@/lib/i18n'
import { queryClient } from '@/lib/query'
import { ThemeProvider, initThemeChoice, useResolvedTheme } from '@/theme/ThemeProvider'
import { themeColors } from '@/theme/vars'

// .catch: a failed call here must never block the splash gate below — worst
// case the splash is dismissed by the OS on its own timeout instead of by us.
SplashScreen.preventAutoHideAsync().catch(() => {})

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
  // useFonts discards nothing here on purpose: `fontError` used to be dropped,
  // which meant a single failed font load left `loaded` false forever and the
  // whole app sat on the splash screen with no recovery path. A font that
  // fails to load is a degraded look (system fallback), not a reason to hang —
  // so fontError counts as "ready" too, and gets reported once.
  const [loaded, fontError] = useFonts({
    CormorantGaramond_500Medium,
    CormorantGaramond_600SemiBold,
    CormorantGaramond_400Regular_Italic,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
  })
  useEffect(() => {
    if (fontError) captureError(fontError, 'fonts.load')
  }, [fontError])

  // Two Keychain reads have to land before the first frame, or the first frame is
  // a lie: the session token (else the gate flashes sign-in at a signed-in member)
  // and the theme choice (else an explicit Afternoon/Candlelit choice flashes the
  // Auto-resolved theme first). Both are bounded internally.
  const [preloaded, setPreloaded] = useState(false)
  useEffect(() => {
    // Warming the analytics client here means the first real event doesn't also
    // pay for init. No-ops without a key.
    initAnalytics()
    Promise.all([initToken(), initThemeChoice(), initLanguage()]).finally(() => setPreloaded(true))
  }, [])

  const ready = (loaded || Boolean(fontError)) && preloaded
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {})
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
            <SheetHost />
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
  const t = useT()
  // Rebuilt only when the theme or language actually changes, not on every
  // render MesaStack happens to take — a theme/language flip already re-runs
  // this component, and an inline object literal here used to hand every
  // Stack.Screen a brand-new `options` reference on unrelated re-renders too.
  const utility = useMemo(
    () => ({
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
      headerBackTitle: t('nav.back'),
    }),
    [theme, c, t],
  )
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // The resolved theme's own ground, never transparent: a pushed
        // screen whose root has no background of its own (friends, menu) used
        // to slide in SEE-THROUGH, the screen underneath showing through it
        // for the whole push — the "wonky" Ajustes → Encuentra amigos.
        contentStyle: { backgroundColor: c.bg },
        // Back-swipe from anywhere on the screen, not just the left edge.
        fullScreenGestureEnabled: true,
        // A screen off-stack (a background tab, a screen under others in this
        // stack) stops re-rendering entirely instead of re-rendering every
        // time a theme/language change restyles the active one.
        freezeOnBlur: true,
      }}
    >
      {/* The compose flows present as sheets — the iOS pattern for "make
          something" opened from a floating action. Drag-to-dismiss runs through
          the same beforeRemove guards the back gesture does, so a half-finished
          ranking still steps backward instead of being thrown away. */}
      <Stack.Screen name="rank" options={{ presentation: 'modal' }} />
      <Stack.Screen name="dish/index" options={{ presentation: 'modal' }} />
      {/* The dish-ranking pairwise flow (M20) — same compare-card idiom as
          rank.tsx's own PlaceStep, so it gets the same modal presentation. */}
      <Stack.Screen name="dish-lists/rank" options={{ presentation: 'modal' }} />
      <Stack.Screen name="plans/new" options={{ presentation: 'modal' }} />
      {/* A feed post's comments — a page sheet over the feed, like the mock:
          the post stays visible behind it, drag down to dismiss. */}
      <Stack.Screen name="comments/[rankingId]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="plans/invite" options={{ presentation: 'modal' }} />
      {/* The list picker (M19) + the one "Nueva lista" create flow — a page
          sheet. Was a formSheet at a 0.5 detent, whose flex-1 content mis-laid
          itself out on device (rows shifted off the edge, title clipped). */}
      <Stack.Screen name="save-to-list" options={{ presentation: 'modal' }} />
      {/* Crop/rotate (M6) — pushed by lib/photoEditor.ts's editPhoto() from
          inside either an already-presented modal (rank, dish/index) or a
          plain screen (Profile's avatar picker); modal-on-modal stacks fine
          natively, unlike Sheet.tsx's own root-overlay limitation. */}
      <Stack.Screen name="photo-edit" options={{ presentation: 'modal' }} />

      {/* r/[restaurantId] has a horizontal similar-spots rail near the screen
          edge; react-native-screens' iOS full-screen swipe already lets a
          horizontal ScrollView claim the drag before starting the back
          gesture, so no override is needed here. */}
      <Stack.Screen name="r/[restaurantId]" />
      {/* "See all dishes" (M22) — the rail's overflow destination, same
          ScreenHeader idiom as menu/[restaurantId] below. */}
      <Stack.Screen name="r/[restaurantId]/dishes" />
      <Stack.Screen name="u/[userId]" />
      {/* The taste-match pair page (M16), reached from u/[userId]'s match
          pill — same custom ScreenHeader idiom, no native title. */}
      <Stack.Screen name="match/[userId]" />
      {/* Menu (M12 hotfix): switched off the native utility bar to a custom
          ScreenHeader, same idiom as u/[userId] and match/[userId] just
          above — the restaurant page it's pushed from has no nav bar either,
          so a bar no longer animates in/out mid-push. */}
      <Stack.Screen name="menu/[restaurantId]" />

      {/* Settings (M15): a hub + Account/Privacy/Preferences/About/Blocked
          accounts sub-screens, all on this same stack so each gets a real
          back button — was one flat app/settings.tsx route. */}
      <Stack.Screen name="settings/index" options={{ ...utility, title: t('nav.settings') }} />
      <Stack.Screen
        name="settings/account"
        options={{ ...utility, headerLargeTitle: false, title: t('settings.account') }}
      />
      <Stack.Screen
        name="settings/privacy"
        options={{ ...utility, headerLargeTitle: false, title: t('settings.privacy') }}
      />
      <Stack.Screen
        name="settings/preferences"
        options={{ ...utility, headerLargeTitle: false, title: t('settings.preferences') }}
      />
      <Stack.Screen
        name="settings/about"
        options={{ ...utility, headerLargeTitle: false, title: t('settings.about') }}
      />
      <Stack.Screen
        name="settings/blocked"
        options={{ ...utility, headerLargeTitle: false, title: t('settings.blocked_accounts') }}
      />
      {/* Push notification prefs (M17) — reached from Settings' nav card, same
          utility-header idiom as its Account/Privacy siblings. */}
      <Stack.Screen
        name="notifications"
        options={{ ...utility, headerLargeTitle: false, title: t('settings.notifications') }}
      />
      <Stack.Screen name="activity" options={{ ...utility, title: t('nav.activity') }} />
      <Stack.Screen name="leaderboard" options={{ ...utility, title: t('nav.leaderboard') }} />
      {/* Title (Seguidores/Siguiendo) is set by the screen itself, same
          pattern as lists/[slug] below. */}
      <Stack.Screen name="people/[userId]" options={utility} />
      <Stack.Screen name="plans/index" options={{ ...utility, title: t('nav.plans') }} />
      <Stack.Screen name="friends/index" options={{ ...utility, title: t('friends.title') }} />
      <Stack.Screen
        name="friends/instagram"
        options={{ ...utility, headerLargeTitle: false, title: t('instagram.title') }}
      />
      {/* Title (the chosen spot, or "Votación abierta") is set by the screen
          itself once the plan loads — same pattern as people/[userId] above. */}
      <Stack.Screen name="plans/[planId]" options={{ ...utility, headerLargeTitle: false }} />
      {/* Moderator-only; the screen itself redirects non-moderators. */}
      <Stack.Screen name="moderation" options={{ ...utility, title: t('nav.moderation') }} />
      {/* Titles for these two are set by the screens themselves once the data
          (a list's name, a legal doc's name) is known. */}
      <Stack.Screen name="lists/[slug]" options={utility} />
      {/* The member's named lists (M19) — "Tus listas" and one list's
          contents. Custom ScreenHeader, same idiom as u/[userId] and
          match/[userId]; the detail screen's native Stack.Screen title is set
          once the list's name loads. */}
      <Stack.Screen name="collections/index" />
      <Stack.Screen name="collections/[collectionId]" />
      {/* Dish ranking (M20) — "Tus platos" and one list's detail, same custom
          ScreenHeader idiom as collections/[collectionId] above; each sets its
          own title internally the same way that screen does. */}
      <Stack.Screen name="dish-lists/index" />
      <Stack.Screen name="dish-lists/[listId]" />
      {/* One curated event's detail (M21) — same bare custom-header idiom as
          dish-lists/[listId] above; no dynamic title to seed since ScreenHeader
          here has no native title at all. */}
      <Stack.Screen name="events/[eventId]" />
      <Stack.Screen name="legal/[doc]" options={utility} />
    </Stack>
  )
}
