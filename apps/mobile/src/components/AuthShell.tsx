import { StatusBar } from 'expo-status-bar'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemeScope } from '@/theme/ThemeProvider'

// The ground the signed-out screens share (sign-in, the verify-email and reset-password pages
// the emails link to): the app's burgundy in Day AND Night, the wordmark and the words above
// it in cream, and the form on a cream card. The ground is the same fixed colour in both
// themes — so the status bar is always light here, and the card is always Day (ThemeScope):
// a Night card would put dark fields on cream. Everything after sign-in is the member's theme.
export function AuthGround({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-accent-fill">
      <StatusBar style="light" animated />
      {children}
    </SafeAreaView>
  )
}

// The cream card, r30, its contents in Day tokens whatever the theme.
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <ThemeScope theme="day">
      <View className="gap-3 rounded-hero bg-bg p-5">{children}</View>
    </ThemeScope>
  )
}
