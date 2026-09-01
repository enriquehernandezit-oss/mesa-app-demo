import '../global.css'
import { ThemeProvider } from '@/theme/ThemeProvider'
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
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  // The exact faces the tailwind fontFamily map references (weights aren't
  // synthesized in RN, so each is loaded explicitly — mirrors the web's
  // font-synthesis:none rule).
  const [loaded] = useFonts({
    CormorantGaramond_500Medium,
    CormorantGaramond_600SemiBold,
    CormorantGaramond_400Regular_Italic,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    JetBrainsMono_400Regular,
  })

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync()
  }, [loaded])

  if (!loaded) return null

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Stack
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}
        />
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
