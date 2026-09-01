import { useTheme } from '@/theme/ThemeProvider'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const API = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'

// N0 smoke screen: proves the theme layer resolves (both themes, tappable
// toggle), the fonts load, and the app can reach the deployed API. The data
// layer (TanStack Query) and the real App gate arrive in N2 — this uses a plain
// fetch on purpose to keep N0 to scaffold + theme.
type Health = { status: 'loading' | 'ok' | 'error'; service?: string }

export default function Index() {
  const { resolved, choice, setChoice } = useTheme()
  const [health, setHealth] = useState<Health>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetch(`${API}/health`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(
        (d: { service: string }) => !cancelled && setHealth({ status: 'ok', service: d.service }),
      )
      .catch(() => !cancelled && setHealth({ status: 'error' }))
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <StatusBar style={resolved === 'candlelit' ? 'light' : 'dark'} />
      <View className="flex-1 items-center justify-center gap-5 px-5">
        <Text className="font-serif-semibold text-display text-text">mesa</Text>
        <Text className="font-mono text-eyebrow uppercase tracking-eyebrow text-accent-strong">
          Una revolución gastronómica social
        </Text>

        <View className="mt-6 items-center gap-2">
          <Text className="font-ui text-label text-text-muted">API</Text>
          <Text className="font-ui-medium text-body text-text">
            {health.status === 'loading'
              ? 'conectando…'
              : health.status === 'error'
                ? 'sin conexión'
                : `${health.service} · ok`}
          </Text>
        </View>

        <Pressable
          className="mt-6 rounded-pill bg-accent-fill px-6 py-3 active:opacity-80"
          onPress={() => setChoice(choice === 'candlelit' ? 'afternoon' : 'candlelit')}
        >
          <Text className="font-ui-semibold text-label text-on-accent">Tema: {resolved}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}
